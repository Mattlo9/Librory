import { describe, expect, test } from 'bun:test';
import { clampCoverAspectRatio } from '@/components/ui/cover-image';
import { parsePomodoroDurationInput } from '@/features/pomodoro/lib/formatTime';
import {
  computeStudyEvolutionStats,
  type StudySessionWithItemRow,
} from '@/services/studySessionRepository';
import type { StudyEvolutionGranularity } from '@/types/domain';

function makeSessionRow(
  overrides: Partial<StudySessionWithItemRow> & {
    id: string;
    local_date: string;
    duration_seconds: number;
  },
): StudySessionWithItemRow {
  return {
    item_id: null,
    phase: 'focus',
    planned_seconds: overrides.duration_seconds,
    completed: 1,
    started_at: `${overrides.local_date}T10:00:00Z`,
    ended_at: `${overrides.local_date}T10:25:00Z`,
    local_hour: 10,
    created_at: `${overrides.local_date}T10:25:00Z`,
    item_title: null,
    item_author: null,
    ...overrides,
  };
}

describe('Pomodoro inline duration parser', () => {
  test('parses plain minutes and clamps to bounds', () => {
    expect(parsePomodoroDurationInput('40', 1, 240)).toEqual({
      totalSeconds: 2400,
      preferenceMinutes: 40,
    });
    expect(parsePomodoroDurationInput('240', 1, 240)).toEqual({
      totalSeconds: 14400,
      preferenceMinutes: 240,
    });
    expect(parsePomodoroDurationInput('300', 1, 240)).toEqual({
      totalSeconds: 14400,
      preferenceMinutes: 240,
    });
    expect(parsePomodoroDurationInput('90', 1, 60)).toEqual({
      totalSeconds: 3600,
      preferenceMinutes: 60,
    });
  });

  test('parses MM:SS and H:MM:SS formats accurately', () => {
    expect(parsePomodoroDurationInput('45:30', 1, 240)).toEqual({
      totalSeconds: 2730,
      preferenceMinutes: 45,
    });
    expect(parsePomodoroDurationInput('1:30', 1, 240)).toEqual({
      totalSeconds: 90,
      preferenceMinutes: 1,
    });
    expect(parsePomodoroDurationInput('0:30', 1, 240)).toEqual({
      totalSeconds: 60,
      preferenceMinutes: 1,
    });
    expect(parsePomodoroDurationInput('1:30:00', 1, 240)).toEqual({
      totalSeconds: 5400,
      preferenceMinutes: 90,
    });
    expect(parsePomodoroDurationInput('2:15:30', 1, 240)).toEqual({
      totalSeconds: 8130,
      preferenceMinutes: 135,
    });
  });

  test('rejects invalid duration strings', () => {
    expect(parsePomodoroDurationInput('', 1, 240)).toBe(null);
    expect(parsePomodoroDurationInput('   ', 1, 240)).toBe(null);
    expect(parsePomodoroDurationInput('0', 1, 240)).toBe(null);
    expect(parsePomodoroDurationInput('-10', 1, 240)).toBe(null);
    expect(parsePomodoroDurationInput('abc', 1, 240)).toBe(null);
    expect(parsePomodoroDurationInput('10:75', 1, 240)).toBe(null);
    expect(parsePomodoroDurationInput('1:70:00', 1, 240)).toBe(null);
  });
});

describe('Pomodoro store custom duration behavior', () => {
  test('saves preference, supports 240 min ceiling, and preserves exact MM:SS on start()', async () => {
    const g = globalThis as unknown as {
      localStorage?: Storage;
      window?: { localStorage: Storage };
    };
    const installedMock = !g.localStorage && !g.window?.localStorage;
    if (installedMock) {
      const backing = new Map<string, string>();
      // Delegate to any later test's window.localStorage because Zustand persist
      // caches the storage reference once at module evaluation time.
      const delegatingStorage: Storage = {
        getItem: (k: string) => {
          const active = g.window?.localStorage;
          if (active && active !== delegatingStorage) return active.getItem(k);
          return backing.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          const active = g.window?.localStorage;
          if (active && active !== delegatingStorage) active.setItem(k, v);
          else backing.set(k, v);
        },
        removeItem: (k: string) => {
          const active = g.window?.localStorage;
          if (active && active !== delegatingStorage) active.removeItem(k);
          else backing.delete(k);
        },
        clear: () => {
          const active = g.window?.localStorage;
          if (active && active !== delegatingStorage) active.clear();
          else backing.clear();
        },
        key: (idx: number) => {
          const active = g.window?.localStorage;
          if (active && active !== delegatingStorage) return active.key(idx);
          return Array.from(backing.keys())[idx] ?? null;
        },
        get length() {
          const active = g.window?.localStorage;
          if (active && active !== delegatingStorage) return active.length;
          return backing.size;
        },
      };
      g.localStorage = delegatingStorage;
      g.window = { localStorage: delegatingStorage };
    }

    const { usePomodoroStore } = await import('@/store/pomodoroStore');
    const store = usePomodoroStore.getState();

    store.reset();
    store.selectPhase('focus');

    // Exact MM:SS (45:30 = 2730s) updates focusMinutes=45 and preserves 2730s on start()
    usePomodoroStore.getState().setCustomPhaseDuration(2730);
    expect(usePomodoroStore.getState().plannedSeconds).toBe(2730);
    expect(usePomodoroStore.getState().remainingSeconds).toBe(2730);
    expect(usePomodoroStore.getState().focusMinutes).toBe(45);

    usePomodoroStore.getState().start();
    expect(usePomodoroStore.getState().status).toBe('running');
    expect(usePomodoroStore.getState().plannedSeconds).toBe(2730);

    // Ignored while running
    usePomodoroStore.getState().setCustomPhaseDuration(600);
    expect(usePomodoroStore.getState().plannedSeconds).toBe(2730);

    // Ceiling up to 240 min when idle
    usePomodoroStore.getState().reset();
    usePomodoroStore.getState().setCustomPhaseDuration(240 * 60);
    expect(usePomodoroStore.getState().focusMinutes).toBe(240);
    expect(usePomodoroStore.getState().plannedSeconds).toBe(14400);

    usePomodoroStore.getState().setCustomPhaseDuration(300 * 60);
    expect(usePomodoroStore.getState().focusMinutes).toBe(240);
    expect(usePomodoroStore.getState().plannedSeconds).toBe(14400);

    // Short break phase custom duration
    usePomodoroStore.getState().selectPhase('short_break');
    usePomodoroStore.getState().setCustomPhaseDuration(90 * 60);
    expect(usePomodoroStore.getState().shortBreakMinutes).toBe(60);
    expect(usePomodoroStore.getState().plannedSeconds).toBe(3600);

    // Restore clean idle focus state
    usePomodoroStore.getState().selectPhase('focus');
    usePomodoroStore.getState().updateSettings({ focusMinutes: 25, shortBreakMinutes: 5 });

    // Also validate uiStore cover size (list) & coverFit state
    const { useUiStore } = await import('@/store/uiStore');
    useUiStore.getState().setListCoverSize(999);
    expect(useUiStore.getState().listCoverSize).toBe(104);
    useUiStore.getState().setListCoverSize(10);
    expect(useUiStore.getState().listCoverSize).toBe(36);
    useUiStore.getState().setListCoverSize(Number.NaN);
    expect(useUiStore.getState().listCoverSize).toBe(36);
    useUiStore.getState().setCoverFit('cover');
    expect(useUiStore.getState().coverFit).toBe('cover');
    useUiStore.getState().setCoverFit('contain');
    useUiStore.getState().setListCoverSize(56);

    if (installedMock) {
      delete g.window;
      delete g.localStorage;
    }
  });
});

describe('Cover aspect ratio normalization', () => {
  test('clamps extreme ratios while preserving natural book/A4/slide proportions', () => {
    expect(clampCoverAspectRatio(600, 900)).toBe(600 / 900);
    expect(clampCoverAspectRatio(595, 842)).toBe(595 / 842); // A4
    expect(clampCoverAspectRatio(1200, 900)).toBe(1200 / 900); // 4:3 slides
    expect(clampCoverAspectRatio(300, 1200)).toBe(0.55); // clamped min
    expect(clampCoverAspectRatio(2400, 800)).toBe(1.65); // clamped max
    expect(clampCoverAspectRatio(0, 900)).toBe(null);
    expect(clampCoverAspectRatio(600, Number.NaN)).toBe(null);
  });
});

describe('Study evolution statistics aggregation', () => {
  const referenceDate = new Date(2026, 10, 26, 12, 0, 0); // 2026-11-26 (Thu)
  const sampleRows: StudySessionWithItemRow[] = [
    makeSessionRow({
      id: 's1',
      local_date: '2026-11-26',
      duration_seconds: 1500,
      item_id: 'book-a',
      item_title: 'Clean Architecture',
      item_author: 'Robert C. Martin',
    }),
    makeSessionRow({
      id: 's2',
      local_date: '2026-11-26',
      duration_seconds: 900,
      item_id: null,
    }),
    makeSessionRow({
      id: 's3',
      local_date: '2026-11-25',
      duration_seconds: 1200,
      item_id: 'book-b',
      item_title: 'Designing Data-Intensive Applications',
      item_author: 'Martin Kleppmann',
    }),
    makeSessionRow({
      id: 's4',
      local_date: '2026-11-23',
      duration_seconds: 600,
      item_id: 'book-a',
      item_title: 'Clean Architecture',
      item_author: 'Robert C. Martin',
    }),
    makeSessionRow({
      id: 's5',
      local_date: '2026-11-18',
      duration_seconds: 2100,
      item_id: 'book-a',
      item_title: 'Clean Architecture',
      item_author: 'Robert C. Martin',
    }),
    makeSessionRow({
      id: 's6',
      local_date: '2026-11-05',
      duration_seconds: 1800,
      item_id: 'book-b',
      item_title: 'Designing Data-Intensive Applications',
      item_author: 'Martin Kleppmann',
    }),
    makeSessionRow({
      id: 's7',
      local_date: '2026-10-15',
      duration_seconds: 5400,
      item_id: 'book-a',
      item_title: 'Clean Architecture',
      item_author: 'Robert C. Martin',
    }),
    makeSessionRow({
      id: 's8',
      local_date: '2025-05-10',
      duration_seconds: 3600,
      item_id: 'book-b',
      item_title: 'Designing Data-Intensive Applications',
      item_author: 'Martin Kleppmann',
    }),
  ];

  test('computes day/week/month/all-time summaries and percentage deltas', () => {
    const stats = computeStudyEvolutionStats(sampleRows, 'day14', referenceDate);

    expect(stats.summaries.today).toEqual({
      currentSeconds: 2400,
      previousSeconds: 1200,
      currentSessions: 2,
      deltaPercent: 100,
    });
    expect(stats.summaries.thisWeek).toEqual({
      currentSeconds: 4200,
      previousSeconds: 2100,
      currentSessions: 4,
      deltaPercent: 100,
    });
    expect(stats.summaries.thisMonth).toEqual({
      currentSeconds: 8100,
      previousSeconds: 5400,
      currentSessions: 6,
      deltaPercent: 50,
    });
    expect(stats.summaries.allTimeSeconds).toBe(17100);
    expect(stats.summaries.allTimeSessions).toBe(8);
  });

  test('returns null deltaPercent when previous comparison period has zero seconds', () => {
    const onlyToday = [
      makeSessionRow({
        id: 'only-today',
        local_date: '2026-11-26',
        duration_seconds: 1500,
      }),
    ];
    const stats = computeStudyEvolutionStats(onlyToday, 'day14', referenceDate);
    expect(stats.summaries.today.deltaPercent).toBe(null);
    expect(stats.summaries.thisWeek.deltaPercent).toBe(null);
    expect(stats.summaries.thisMonth.deltaPercent).toBe(null);
  });

  test('builds chronological buckets with monotonic cumulative totals across all granularities', () => {
    const expectedCounts: Record<StudyEvolutionGranularity, number> = {
      day14: 14,
      day30: 30,
      week12: 12,
      month12: 12,
      year: 3, // 2024, 2025, 2026
    };

    (Object.keys(expectedCounts) as StudyEvolutionGranularity[]).forEach(
      (granularity) => {
        const result = computeStudyEvolutionStats(
          sampleRows,
          granularity,
          referenceDate,
        );
        expect(result.buckets.length).toBe(expectedCounts[granularity]);

        let prevCum = 0;
        for (const bucket of result.buckets) {
          expect(bucket.cumulativeSeconds >= prevCum).toBe(true);
          prevCum = bucket.cumulativeSeconds;
        }
        const last = result.buckets[result.buckets.length - 1]!;
        expect(last.cumulativeSeconds).toBe(result.periodTotalSeconds);
        expect(last.isCurrentPeriod).toBe(true);
      },
    );
  });

  test('ranks per-book breakdown including Estudio libre', () => {
    const stats = computeStudyEvolutionStats(sampleRows, 'day30', referenceDate);

    // Within 2026-10-28 .. 2026-11-26: book-a = 1500+600+2100 = 4200, book-b = 1200+1800 = 3000, free = 900 (total 8100)
    expect(stats.periodTotalSeconds).toBe(8100);
    expect(stats.bookBreakdown.length).toBe(3);
    expect(stats.bookBreakdown[0]).toEqual({
      itemId: 'book-a',
      title: 'Clean Architecture',
      author: 'Robert C. Martin',
      focusSeconds: 4200,
      sessions: 3,
      sharePercent: 51.9,
    });
    expect(stats.bookBreakdown[1]).toEqual({
      itemId: 'book-b',
      title: 'Designing Data-Intensive Applications',
      author: 'Martin Kleppmann',
      focusSeconds: 3000,
      sessions: 2,
      sharePercent: 37,
    });
    expect(stats.bookBreakdown[2]).toEqual({
      itemId: null,
      title: 'Estudio libre',
      author: '',
      focusSeconds: 900,
      sessions: 1,
      sharePercent: 11.1,
    });
  });
});
