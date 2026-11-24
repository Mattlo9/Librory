# Librory — Full-Stack Security Audit & Remediation Report

**Audit Date:** 2026-11-24  
**Baseline Audited:** `main` (`5d7670e`)  
**Remediation Branch:** `security/full-stack-audit-hardening`  
**Scope:** All 5 application layers — (1) Tauri Architecture, IPC, Capabilities & Rust Backend, (2) EPUB/ZIP/PDF Document Parsing & Rendering, (3) SQLite Database, Migrations & Repositories, (4) Frontend UI, Markdown Preview, Obsidian Export & Client Storage, (5) Supply Chain, Dependencies, Build Configuration & Secrets Hygiene.

---

## Executive Summary

A comprehensive multi-layer security audit identified **34 findings** (**3 Critical, 6 High, 14 Medium, 8 Low, 3 Informational**). Every Critical, High, Medium, Low, and Informational finding actionable within this repository has been remediated and covered by automated Rust and TypeScript security regression tests.

### Architectural Highlights of Remediation
1. **Least-Privilege Tauri Boundary:** Stripped all `sql:*`, `fs:*`, `opener:*`, and `dialog:*` permissions from `src-tauri/capabilities/default.json` (reduced strictly to `"core:default"`), removed unused frontend `@tauri-apps/plugin-{sql,fs,dialog,opener}` packages, added a native WebView `on_navigation` origin guard in `src-tauri/src/lib.rs`, narrowed `assetProtocol.scope` strictly to `$APPDATA/covers/*.webp`, hardened CSP (`base-uri 'none'`, `form-action 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, `frame-src 'self'`), and enabled `freezePrototype: true`.
2. **Rust-Owned Hardened SQLite (`rusqlite 0.43` / `libsqlite3-sys 0.40` / SQLite >= 3.54):** Replaced `tauri-plugin-sql` (`sqlx 0.8.6` / vulnerable SQLite 3.46.0) with typed, parameterized, transactional Rust commands (`src-tauri/src/db.rs`), eliminating unscoped WebView SQL execution, patching 4 bundled SQLite CVEs, dropping `sqlx-mysql`/`rsa 0.9.10` from `Cargo.lock`, enforcing `PRAGMA foreign_keys/recursive_triggers/trusted_schema = OFF` + SQLite `ATTACH`/`DETACH` authorizer denial on every connection, and adding schema integrity triggers in `005_security_hardening.sql`.
3. **Allowlist EPUB Sanitizer & Zip-Bomb Defense:** Replaced the bypassable denylist sanitizer in `src/services/epubReaderService.ts` with a scratch-built HTML-only allowlist DOM reconstructor (eliminating XML namespace-prefix bypasses, XHTML-to-HTML raw-text mXSS, `<template>` blind spots, SVG/SMIL/XLink vectors, inline `style` UI redressing, and DOM clobbering), added strict pre-allocation ZIP decompression limits (`src/lib/safeZip.ts`), and disabled PDF AcroJS/lifecycle actions/attachments in `PdfReaderView.tsx`.
4. **Rust-Owned Native Dialogs, Magic-Byte Checks & Atomic I/O:** Moved file pickers and save dialogs into Rust (`src-tauri/src/import.rs`, `src-tauri/src/export.rs`, `src-tauri/src/storage.rs`), enforced user-approved import allowlists (native picker + OS drag-and-drop), single-handle stream-hash-copy (eliminating TOCTOU), PDF/EPUB/WebP magic-byte verification, UNC/ADS/symlink rejection, Windows reserved DOS name guards, and non-overwriting vault exports.

---

## Findings & Remediation Status

| ID | Severity | Layer | Finding Summary | Status |
| :--- | :--- | :--- | :--- | :--- |
| `SEC-01` | **Critical** | Doc Parsing | Multiple EPUB HTML sanitizer bypasses (XML namespace prefixes, raw-text mXSS, `<template>`, inline `style`, DOM clobbering) & main-DOM injection (`epubReaderService.ts`, `EpubReaderView.tsx`) | **Fixed** |
| `SEC-02` | **Critical** | Tauri / Rust | WebView-to-RCE escalation via recursive `$APPDATA` write + extensionless `opener:allow-open-path` & missing `fs:deny-default` (`capabilities/default.json`) | **Fixed** |
| `SEC-03` | **Critical** | Tauri / DB | Unscoped frontend SQL bridge (`sql:allow-load` + `sql:allow-execute`) enabling cross-OS SQLite access & `ATTACH`/`VACUUM INTO` arbitrary file writes | **Fixed** |
| `SEC-04` | **High** | Supply Chain | Outdated bundled SQLite 3.46.0 (`libsqlite3-sys 0.30.1`) vulnerable to `CVE-2025-29087`/`3277`, `CVE-2025-6965`, `CVE-2025-7709` (FTS5 OOB), `CVE-2026-119375`/`RUSTSEC-2026-0459` | **Fixed** (`libsqlite3-sys 0.40.0` / SQLite >= 3.54) |
| `SEC-05` | **High** | Tauri / Rust | Arbitrary filesystem write, symlink escape, silent overwrite & UNC/ADS exfiltration in `export_markdown_file` & `export_obsidian_vault` (`export.rs`) | **Fixed** |
| `SEC-06` | **High** | Tauri / Rust | Arbitrary external file copy, symlink following, extension-only check, existence oracle & UNC NTLM leak in `import_book_file` (`import.rs`) | **Fixed** |
| `SEC-07` | **High** | Doc Parsing | Unchecked EPUB/ZIP decompression (Zip Bomb) & spine/TOC amplification DoS (`epubProcessor.ts`, `epubReaderService.ts`) | **Fixed** (`safeZip.ts`) |
| `SEC-08` | **High** | Doc Parsing | EPUB SVG/external link click-handler bypass (`HTMLElement` check), unrestricted URL schemes & SVG `image`/`blob:` exposure | **Fixed** |
| `SEC-09` | **High** | DB / Storage | Unvalidated `file_path`/`cover_path` in SQLite & path traversal / prefix-check bypass in `fileService.ts`, `bookRepository.ts`, `useAssetUrl.ts` | **Fixed** |
| `SEC-10` | **Medium** | Tauri / Rust | Unrestricted `opener:default` & unscoped `opener:allow-reveal-item-in-dir` bypassing offline CSP exfiltration boundary | **Fixed** |
| `SEC-11` | **Medium** | Tauri Config | CSP gaps (`base-uri`, `form-action`, `object-src`, `frame-ancestors`, `frame-src`, `freezePrototype`) & overly broad `assetProtocol` scope (`tauri.conf.json`) | **Fixed** |
| `SEC-12` | **Medium** | Rust / Import | TOCTOU double-open race, unbounded file/export size DoS, silent spoofed-file ingestion & main-thread blocking I/O | **Fixed** |
| `SEC-13` | **Medium** | Doc Parsing | PDF AcroJS scripting, lifecycle/hover actions & attachments enabled by default + WebView `window.open` links (`PdfReaderView.tsx`) | **Fixed** |
| `SEC-14` | **Medium** | Doc Parsing | Unbounded canvas/bitmap dimensions & missing resource caps in PDF/EPUB cover extraction (`pdfProcessor.ts`, `epubProcessor.ts`) | **Fixed** |
| `SEC-15` | **Medium** | DB / Rust | Connection-scoped SQLite PRAGMAs executed once on pooled `sqlx` connections & default Unix dir permissions | **Fixed** |
| `SEC-16` | **Medium** | Database | Missing transaction atomicity in bulk mutations, `saveReadingProgress` race, shelf cycle TOCTOU & concurrent seeding race | **Fixed** |
| `SEC-17` | **Medium** | Database | Missing schema constraints (`file_hash` partial unique index, validation triggers) & unvalidated numeric/date/folder/color/`LIMIT` inputs | **Fixed** (`005_security_hardening.sql`) |
| `SEC-18` | **Medium** | Frontend UI | YAML frontmatter breakout (`\r`, `\u0085`, `\u2028`, `\u2029`, control chars, unquoted timestamps) in Obsidian export (`obsidianExport.ts`) | **Fixed** |
| `SEC-19` | **Medium** | Frontend UI | Uncontrolled external `<a href>` navigation & link spoofing in `MarkdownPreview` + missing WebView `on_navigation` guard | **Fixed** |
| `SEC-20` | **Medium** | Frontend UI | Polynomial ReDoS in `MarkdownPreview`, `extractWikilinkTargets` (`NotesView`), and `sanitizeNoteFilename` | **Fixed** |
| `SEC-21` | **Medium** | Frontend UI | Unvalidated `localStorage` rehydration in `pomodoroStore` & `uiStore`, `NaN` time formatters & missing React `ErrorBoundary` | **Fixed** |
| `SEC-22` | **Medium** | Supply Chain | Native process stack-overflow DoS in `url 2.5.8` (`RUSTSEC-2026-0592`) | **Fixed** (`url 2.5.9`) |
| `SEC-23` | **Medium** | Hygiene | `.gitignore` omits `.env*`, local SQLite files (`*.db`, `*.sqlite*`), and signing keys | **Fixed** |
| `SEC-24` | **Low** | Rust / Export | Windows reserved DOS device names (`CON`, `NUL`, `AUX`, `COM1`–`LPT9`), post-truncation dots/spaces & case-insensitive/on-disk vault overwrites | **Fixed** |
| `SEC-25` | **Low** | Doc Parsing | Prototype property confusion on plain-object ZIP entry map in `epubProcessor.ts` | **Fixed** |
| `SEC-26` | **Low** | Database | `INSERT OR IGNORE` on join tables silently swallows foreign-key violations | **Fixed** (`ON CONFLICT DO NOTHING`) |
| `SEC-27` | **Low** | Database / UI | Unbounded FTS5 prefix token expansion & NUL bytes in `sanitizeFtsQuery` + unbounded search inputs | **Fixed** |
| `SEC-28` | **Low** | Frontend UI | Missing cycle handling in `buildShelfTree`/`groupItemsByShelf` & unbounded recursion in `Sidebar` | **Fixed** |
| `SEC-29` | **Low** | Supply Chain | Unverified third-party remote component registry (`shadcnspace.com`) in `components.json` | **Fixed** |
| `SEC-30` | **Low** | Supply Chain | Transitive advisories (`cookie 0.18.2`, lockfile `rsa 0.9.10`, Linux `glib`, transitive `zod 3.25.76`) & unhardened `pdfjs-dist` options | **Fixed / Tracked** (`cookie 0.18.3`, `rsa` removed, `pdfjs-dist` hardened; upstream Linux GTK3 `glib` & `@embedpdf` `zod` tracked upstream) |
| `SEC-31` | **Low** | Build Config | Vite dev server does not deny `src-tauri/`, `.git/`, or DB files under project root (`vite.config.ts`) | **Fixed** |
| `SEC-32` | **Info** | Tauri Config | Redundant/unused capability permissions in `capabilities/default.json` | **Fixed** |
| `SEC-33` | **Info** | Database | Live production DB mutation in `runFtsSmokeTest` & case-insensitive `LIKE 'sample/%'` | **Fixed** (isolated in-memory smoke test + case-sensitive `GLOB 'sample/*'`) |
| `SEC-34` | **Info** | Build Config | Missing Rust `[profile.release]` hardening & `tsconfig.node.json` skipped by `tsc --noEmit` | **Fixed** |

---

## Secrets & Git History Hygiene

- Verified zero committed `.env*`, `*.db`, `*.sqlite*`, `*.key`, `*.pem`, or `dist/` build files across tracked files and git history.
- Verified zero hardcoded API keys, private keys, passwords, `debugger`, or `console.log` statements across `src/` and `src-tauri/`.
