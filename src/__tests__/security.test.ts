import { describe, expect, test } from 'bun:test';
import { zipSync } from 'fflate';
import { formatClock, formatDurationCompact, formatPeakHour } from '@/features/pomodoro/lib/formatTime';
import { buildObsidianMarkdown } from '@/features/notes/lib/obsidianExport';
import { safeUnzipEpub } from '@/lib/safeZip';
import { buildShelfTree } from '@/lib/shelfTree';
import { sanitizeFtsQuery } from '@/lib/text';
import {
  escapeYamlString,
  isSafeAssetUrl,
  isSafeHttpUrl,
  isSafeItemFilePath,
  isSafeItemId,
  isSafeStoredBookPath,
  isSafeStoredCoverPath,
  isWindowsReservedName,
  sanitizeNoteFilename,
  sanitizeNoteFolder,
} from '@/lib/validation';
import { sanitizeChapterMarkupToHtml } from '@/services/epubReaderService';
import type { NoteWithItem, ShelfWithCount } from '@/types/domain';

// Minimal DOM harness for exercising `sanitizeChapterMarkupToHtml` deterministically in bun:test
class MockAttr {
  constructor(
    public name: string,
    public value: string,
    public localName: string = name.includes(':') ? name.split(':').pop()! : name,
  ) {}
}

class MockTextNode {
  readonly nodeType = 3;
  readonly childNodes: never[] = [];
  constructor(public nodeValue: string) {}
}

function escapeHtmlAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr', 'col']);

class MockElement {
  readonly nodeType = 1;
  readonly childNodes: Array<MockElement | MockTextNode> = [];
  readonly attributes: MockAttr[] = [];
  readonly localName: string;

  constructor(
    public tagName: string,
    attrs: Array<[string, string, string?]> = [],
    children: Array<MockElement | MockTextNode> = [],
  ) {
    this.localName = tagName.includes(':') ? tagName.split(':').pop()! : tagName;
    for (const [n, v, l] of attrs) {
      this.attributes.push(new MockAttr(n, v, l));
    }
    this.childNodes.push(...children);
  }

  appendChild(child: MockElement | MockTextNode): void {
    this.childNodes.push(child);
  }

  getAttribute(name: string): string | null {
    const found = this.attributes.find((a) => a.name === name);
    return found ? found.value : null;
  }

  setAttribute(name: string, value: string): void {
    const existing = this.attributes.find((a) => a.name === name);
    if (existing) {
      existing.value = value;
    } else {
      this.attributes.push(new MockAttr(name, value));
    }
  }

  getElementsByTagNameNS(_ns: string, local: string): MockElement[] {
    const out: MockElement[] = [];
    const visit = (el: MockElement) => {
      for (const child of el.childNodes) {
        if (child instanceof MockElement) {
          if (child.localName.toLowerCase() === local.toLowerCase()) {
            out.push(child);
          }
          visit(child);
        }
      }
    };
    visit(this);
    return out;
  }

  getElementsByTagName(tag: string): MockElement[] {
    return this.getElementsByTagNameNS('*', tag);
  }

  serialize(): string {
    const tag = this.tagName.toLowerCase();
    const attrStr = this.attributes
      .map((a) => ` ${a.name}="${escapeHtmlAttr(a.value)}"`)
      .join('');
    if (VOID_TAGS.has(tag)) {
      return `<${tag}${attrStr}>`;
    }
    const inner = this.childNodes
      .map((c) => (c instanceof MockTextNode ? escapeHtmlText(c.nodeValue) : c.serialize()))
      .join('');
    return `<${tag}${attrStr}>${inner}</${tag}>`;
  }

  get innerHTML(): string {
    return this.childNodes
      .map((c) => (c instanceof MockTextNode ? escapeHtmlText(c.nodeValue) : c.serialize()))
      .join('');
  }
}

const mockOwnerDoc = {
  createElement: (tag: string) => new MockElement(tag),
  createTextNode: (text: string) => new MockTextNode(text),
} as unknown as Document;

describe('Path, ID & URL Validation (SEC-02, SEC-08, SEC-09, SEC-19, SEC-24)', () => {
  test('validates safe book, cover, and item paths strictly', () => {
    expect(isSafeItemId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isSafeItemId('CON')).toBe(false);
    expect(isSafeItemId('../escape')).toBe(false);

    expect(isSafeStoredBookPath('books/item_123.pdf')).toBe(true);
    expect(isSafeStoredBookPath('books/item_123.epub')).toBe(true);
    expect(isSafeStoredBookPath('books/../library.db')).toBe(false);
    expect(isSafeStoredBookPath('books/payload.bat')).toBe(false);
    expect(isSafeStoredBookPath('books/payload.exe')).toBe(false);
    expect(isSafeStoredBookPath('books/NUL.pdf')).toBe(false);
    expect(isSafeStoredBookPath('books/nested/file.pdf')).toBe(false);
    expect(isSafeStoredBookPath('sample/demo.pdf')).toBe(false);

    expect(isSafeStoredCoverPath('covers/item_123.webp')).toBe(true);
    expect(isSafeStoredCoverPath('covers/../library.db')).toBe(false);
    expect(isSafeStoredCoverPath('covers/icon.svg')).toBe(false);
    expect(isSafeStoredCoverPath('covers/AUX.webp')).toBe(false);

    expect(isSafeItemFilePath('sample/local-first.pdf')).toBe(true);
    expect(isSafeItemFilePath('books/abc.epub')).toBe(true);
    expect(isSafeItemFilePath('sample/../books/abc.pdf')).toBe(false);

    expect(isSafeAssetUrl('asset://localhost/covers/a.webp')).toBe(true);
    expect(isSafeAssetUrl('http://asset.localhost/covers/a.webp')).toBe(true);
    expect(isSafeAssetUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeAssetUrl('https://evil.example/cover.png')).toBe(false);
  });

  test('blocks unsafe URL schemes and internal/loopback hosts', () => {
    expect(isSafeHttpUrl('https://example.org/book?p=1')).toBe(true);
    expect(isSafeHttpUrl('http://example.org')).toBe(true);

    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<h1>x</h1>')).toBe(false);
    expect(isSafeHttpUrl('file:///C:/Windows/win.ini')).toBe(false);
    expect(isSafeHttpUrl('smb://attacker.example/share')).toBe(false);
    expect(isSafeHttpUrl('http://ipc.localhost/invoke')).toBe(false);
    expect(isSafeHttpUrl('http://asset.localhost/covers/a.webp')).toBe(false);
    expect(isSafeHttpUrl('http://127.0.0.1:1420')).toBe(false);
    expect(isSafeHttpUrl('http://localhost:8080')).toBe(false);
    expect(isSafeHttpUrl('https://example.org/\nHeader: injected')).toBe(false);
  });

  test('detects Windows reserved DOS device names', () => {
    for (const name of ['CON', 'prn', 'Aux.md', 'NUL.pdf', 'COM1', 'lpt9.txt']) {
      expect(isWindowsReservedName(name)).toBe(true);
    }
    expect(isWindowsReservedName('console')).toBe(false);
    expect(isWindowsReservedName('notes')).toBe(false);
  });
});

describe('EPUB Allowlist HTML Sanitizer (SEC-01, SEC-08)', () => {
  test('blocks XML namespace-prefixed dangerous tags, raw-text mXSS, template, style, and DOM clobbering', () => {
    const body = new MockElement('body', [], [
      new MockElement('x:script', [], [new MockTextNode('alert(1)')]),
      new MockElement('x:meta', [['http-equiv', 'refresh'], ['content', '0;url=https://evil.example']]),
      new MockElement('x:base', [['href', 'https://evil.example/']]),
      new MockElement('x:style', [], [new MockTextNode('body { display: none; }')]),
      new MockElement('x:iframe', [['src', 'blob:evil']]),
      new MockElement('xmp', [], [new MockTextNode('</xmp><img src=x onerror=alert(1)>')]),
      new MockElement('noembed', [], [new MockTextNode('<script>evil()</script>')]),
      new MockElement('template', [], [
        new MockElement('script', [], [new MockTextNode('alert(2)')]),
      ]),
      new MockElement(
        'p',
        [
          ['id', 'root'],
          ['style', 'position:fixed;inset:0;z-index:99999'],
          ['onclick', 'alert(3)'],
          ['role', 'dialog'],
        ],
        [new MockTextNode('Safe paragraph text')],
      ),
      new MockElement(
        'a',
        [['p:href', 'javascript:alert(4)', 'href']],
        [new MockTextNode('Bad link')],
      ),
      new MockElement(
        'a',
        [['href', 'https://example.org/ref']],
        [new MockTextNode('External ref')],
      ),
      new MockElement('svg', [], [
        new MockElement('script', [], [new MockTextNode('alert(5)')]),
        new MockElement('image', [['xlink:href', 'images/cover.jpg', 'href']]),
        new MockElement('image', [['xlink:href', 'images/vector.svg', 'href']]),
      ]),
    ]);

    const fakeDoc = { body } as unknown as Document;
    const html = sanitizeChapterMarkupToHtml(
      fakeDoc,
      'OEBPS/ch1.xhtml',
      (zipPath) => (zipPath.endsWith('.jpg') ? 'blob:safe-cover' : null),
      mockOwnerDoc,
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<meta');
    expect(html).not.toContain('<base');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<xmp');
    expect(html).not.toContain('<noembed');
    expect(html).not.toContain('<template');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('role=');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain(' id="root"');

    // Safe text, anchor mapping, external link attributes, and raster SVG cover extraction preserved
    expect(html).toContain('data-epub-id="root"');
    expect(html).toContain('Safe paragraph text');
    expect(html).toContain('href="https://example.org/ref"');
    expect(html).toContain('title="https://example.org/ref"');
    expect(html).toContain('data-epub-external="true"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('<img src="blob:safe-cover">');
    expect(html).not.toContain('vector.svg');
  });
});

describe('EPUB/ZIP Bomb & Prototype Safety (SEC-07, SEC-25)', () => {
  test('extracts valid archive into prototype-safe Map', () => {
    const zipped = zipSync({
      'META-INF/container.xml': new TextEncoder().encode('<container/>'),
      '__proto__': new TextEncoder().encode('ignored'),
    });
    const map = safeUnzipEpub(zipped);
    expect(map.get('meta-inf/container.xml')).toBeInstanceOf(Uint8Array);
    expect(map.has('__proto__')).toBe(false);
    expect(map.get('toString')).toBeUndefined();
  });

  test('rejects spoofed non-ZIP buffers', () => {
    expect(() => safeUnzipEpub(new TextEncoder().encode('%PDF-1.7 fake'))).toThrow();
  });

  test('rejects high compression-ratio Zip Bombs before full decompression', () => {
    // 512 KiB of zeroes compresses to < 1 KiB (>500x compression ratio)
    const bombPayload = new Uint8Array(512 * 1024);
    const bombZip = zipSync({ 'bomb.xhtml': bombPayload }, { level: 9 });
    expect(() => safeUnzipEpub(bombZip)).toThrow(/compresión|bomba ZIP/i);
  });

  test('rejects archives exceeding entry count limits', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 20; i += 1) {
      entries[`f${i}.txt`] = new Uint8Array([65]);
    }
    const archive = zipSync(entries);
    expect(() => safeUnzipEpub(archive, { maxEntries: 10 })).toThrow(/límite/i);
  });
});

describe('Obsidian YAML Breakout, Windows Reserved Names & ReDoS (SEC-18, SEC-20, SEC-24)', () => {
  test('neutralizes CR, Unicode line separators, and unquoted timestamps in YAML frontmatter', () => {
    const escaped = escapeYamlString('Title\r---\rinjected: true\u2028line\u0000end');
    expect(escaped).not.toContain('\r');
    expect(escaped).not.toContain('\n');
    expect(escaped).not.toContain('\u2028');
    expect(escaped).not.toContain('\u0000');

    const note: NoteWithItem = {
      id: 'n1',
      title: 'Book\r---\revil: 1',
      content: 'Body text',
      folder: '../secret/CON/Notas',
      tags_json: '["a\\r---"]',
      tags: ['tag\r---\rexp'],
      item_id: null,
      is_pinned: 0,
      created_at: '2026-11-24T00:00:00Z\r---\revil: 2',
      updated_at: '2026-11-24T00:00:00Z',
      item_title: 'Evil\u2029---',
      item_author: 'Author\u0085---',
    };

    const md = buildObsidianMarkdown(note);
    const lines = md.split('\n');
    const delimiterLines = lines.filter((l) => l.trim() === '---');
    expect(delimiterLines.length).toBe(2);
    expect(md).toContain('created: "');
    expect(md).toContain('folder: "secret/_CON/Notas"');
  });

  test('sanitizes note filenames & folders linearly without ReDoS', () => {
    expect(sanitizeNoteFilename('CON')).toBe('_CON.md');
    expect(sanitizeNoteFilename('nul.md')).toBe('_nul.md');
    expect(sanitizeNoteFolder('../a/../../AUX/./b..')).toBe('a/_AUX/b');

    const start = performance.now();
    const evilFilename = `a${'.'.repeat(50_000)}b`;
    const result = sanitizeNoteFilename(evilFilename);
    const elapsed = performance.now() - start;
    expect(result.endsWith('.md')).toBe(true);
    expect(elapsed).toBeLessThan(200);
  });

  test('markdown inline & wikilink regexes stay linear on adversarial unclosed brackets', () => {
    const inlineRegex =
      /(\[\[[^[\]\n]+\]\]|`[^`\n]+`|\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|\*[^*\n]+?\*|\[[^[\]\n]+\]\([^\s)]+\)|#[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9/_-]{0,40})/g;
    const wikilinkRegex = /\[\[([^[\]\n]+)\]\]/g;
    const adversarial = '['.repeat(50_000);

    const start = performance.now();
    const m1 = Array.from(adversarial.matchAll(inlineRegex));
    const m2 = Array.from(adversarial.matchAll(wikilinkRegex));
    const elapsed = performance.now() - start;

    expect(m1.length).toBe(0);
    expect(m2.length).toBe(0);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('FTS5 Sanitization, Cycle-Safe Shelf Tree & Numeric Bounds (SEC-21, SEC-27, SEC-28)', () => {
  test('bounds FTS5 query length, strips NUL/control bytes, and caps token expansion', () => {
    const huge = 'word '.repeat(500);
    const q = sanitizeFtsQuery(huge);
    expect(q.split(' ').length).toBe(12);
    expect(sanitizeFtsQuery('hello\0world "test":*(x)')).toBe('"helloworld"* "testx"*');
  });

  test('preserves all shelves even when corrupted cycles exist', () => {
    const makeShelf = (id: string, parent_id: string | null): ShelfWithCount => ({
      id,
      name: id,
      parent_id,
      category: 'custom',
      sort_order: 0,
      created_at: '',
      updated_at: '',
      direct_item_count: 0,
      item_count: 0,
    });

    const tree = buildShelfTree([
      makeShelf('self', 'self'),
      makeShelf('a', 'b'),
      makeShelf('b', 'a'),
      makeShelf('c', 'a'),
    ]);

    const visited = new Set<string>();
    const walk = (nodes: typeof tree) => {
      for (const n of nodes) {
        expect(visited.has(n.id)).toBe(false);
        visited.add(n.id);
        walk(n.children);
      }
    };
    walk(tree);
    expect(visited.size).toBe(4);
  });

  test('guards time formatters against NaN and Infinity', () => {
    expect(formatClock(Number.NaN)).toBe('00:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('00:00');
    expect(formatClock(-10)).toBe('00:00');
    expect(formatDurationCompact(Number.NaN)).toBe('0 min');
    expect(formatPeakHour(Number.NaN)).toBe('—');
  });
});

describe('Zustand Persist Rehydration Hardening (SEC-21)', () => {
  test('clamps corrupted localStorage payloads and ignores injected keys', async () => {
    const backing = new Map<string, string>();
    backing.set(
      'librory-pomodoro-v1',
      JSON.stringify({
        state: {
          focusMinutes: -50,
          shortBreakMinutes: 999999,
          longBreakMinutes: Number.NaN,
          cyclesBeforeLongBreak: 100000000,
          autoStartNext: 'yes',
          status: 'running',
          phase: 'long_break',
          start: null,
        },
        version: 1,
      }),
    );
    backing.set(
      'librory-ui-v1',
      JSON.stringify({
        state: {
          coverSize: 999999,
          viewMode: 'malicious',
          sortBy: 'DROP TABLE',
          theme: 'evil',
          expandedShelfIds: null,
          activeSection: 'stats',
          setTheme: null,
        },
        version: 1,
      }),
    );

    const mockStorage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
      clear: () => backing.clear(),
      key: (idx: number) => Array.from(backing.keys())[idx] ?? null,
      get length() {
        return backing.size;
      },
    };
    const g = globalThis as unknown as {
      localStorage: Storage;
      window?: { localStorage: Storage };
    };
    g.localStorage = mockStorage as unknown as Storage;
    g.window = { localStorage: mockStorage as unknown as Storage };

    const { usePomodoroStore } = await import('@/store/pomodoroStore');
    const { useUiStore } = await import('@/store/uiStore');
    await usePomodoroStore.persist.rehydrate();
    await useUiStore.persist.rehydrate();

    const pomo = usePomodoroStore.getState();
    expect(pomo.focusMinutes).toBe(1);
    expect(pomo.shortBreakMinutes).toBe(60);
    expect(pomo.cyclesBeforeLongBreak).toBe(8);
    expect(pomo.status).toBe('idle');
    expect(typeof pomo.start).toBe('function');

    const ui = useUiStore.getState();
    expect(ui.coverSize).toBe(240);
    expect(ui.viewMode).toBe('grid');
    expect(ui.sortBy).toBe('created_desc');
    expect(ui.theme).toBe('dark');
    expect(ui.expandedShelfIds).toEqual({});
    expect(ui.activeSection).toBe('all');
    expect(typeof ui.setTheme).toBe('function');

    ui.setCoverSize(Number.NaN);
    expect(useUiStore.getState().coverSize).toBe(240);
  });
});
