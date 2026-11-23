import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { formatLocalDateKey } from '@/services/studySessionRepository';
import type { CreateStudySessionInput, PomodoroPhase } from '@/types/domain';

export type PomodoroStatus = 'idle' | 'running' | 'paused';

export interface PomodoroBookRef {
  id: string;
  title: string;
}

export interface PomodoroNotice {
  id: string;
  kind: 'focus_complete' | 'break_complete' | 'saved_partial';
  title: string;
  subtitle: string;
  nextPhase?: PomodoroPhase;
  nextMinutes?: number;
}

export interface PomodoroSettingsPatch {
  focusMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
  cyclesBeforeLongBreak?: number;
  soundEnabled?: boolean;
  autoStartNext?: boolean;
}

interface PomodoroState {
  // Persisted preferences
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  soundEnabled: boolean;
  autoStartNext: boolean;
  linkedItemId: string | null;
  linkedItemTitle: string | null;

  // Ephemeral runtime state
  phase: PomodoroPhase;
  status: PomodoroStatus;
  remainingSeconds: number;
  plannedSeconds: number;
  targetEndMs: number | null;
  accumulatedSeconds: number;
  segmentStartedMs: number | null;
  sessionStartedAtIso: string | null;
  sessionLocalDate: string | null;
  sessionLocalHour: number | null;
  sessionItemId: string | null;
  sessionItemTitle: string | null;
  completedFocusCycles: number;
  readerBook: PomodoroBookRef | null;
  manualBookOverrideInReader: boolean;
  notice: PomodoroNotice | null;

  // Actions
  getEffectiveBook: () => PomodoroBookRef | null;
  getElapsedFocusSeconds: (nowMs?: number) => number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  selectPhase: (phase: PomodoroPhase) => void;
  skipPhase: () => void;
  tick: (nowMs: number) => CreateStudySessionInput | null;
  saveAndFinishPartial: () => CreateStudySessionInput | null;
  setReaderBook: (book: PomodoroBookRef | null) => void;
  setLinkedBook: (book: PomodoroBookRef | null) => void;
  applyPreset: (
    focusMinutes: number,
    shortBreakMinutes: number,
    longBreakMinutes: number,
  ) => void;
  updateSettings: (patch: PomodoroSettingsPatch) => void;
  dismissNotice: () => void;
}

function clampMinutes(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getPhaseMinutes(
  phase: PomodoroPhase,
  prefs: Pick<
    PomodoroState,
    'focusMinutes' | 'shortBreakMinutes' | 'longBreakMinutes'
  >,
): number {
  switch (phase) {
    case 'focus':
      return prefs.focusMinutes;
    case 'short_break':
      return prefs.shortBreakMinutes;
    case 'long_break':
      return prefs.longBreakMinutes;
  }
}

function resolveEffectiveBook(
  state: Pick<
    PomodoroState,
    | 'readerBook'
    | 'manualBookOverrideInReader'
    | 'linkedItemId'
    | 'linkedItemTitle'
  >,
): PomodoroBookRef | null {
  if (state.readerBook && !state.manualBookOverrideInReader) {
    return state.readerBook;
  }
  if (state.linkedItemId && state.linkedItemTitle) {
    return { id: state.linkedItemId, title: state.linkedItemTitle };
  }
  return null;
}

function computeElapsedFocusSeconds(
  state: Pick<
    PomodoroState,
    | 'phase'
    | 'status'
    | 'plannedSeconds'
    | 'accumulatedSeconds'
    | 'segmentStartedMs'
  >,
  nowMs: number,
): number {
  if (state.phase !== 'focus' || state.status === 'idle') {
    return 0;
  }
  const liveDelta =
    state.status === 'running' && state.segmentStartedMs !== null
      ? Math.max(0, Math.floor((nowMs - state.segmentStartedMs) / 1000))
      : 0;
  return Math.min(state.plannedSeconds, state.accumulatedSeconds + liveDelta);
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
      soundEnabled: true,
      autoStartNext: false,
      linkedItemId: null,
      linkedItemTitle: null,

      phase: 'focus',
      status: 'idle',
      remainingSeconds: 25 * 60,
      plannedSeconds: 25 * 60,
      targetEndMs: null,
      accumulatedSeconds: 0,
      segmentStartedMs: null,
      sessionStartedAtIso: null,
      sessionLocalDate: null,
      sessionLocalHour: null,
      sessionItemId: null,
      sessionItemTitle: null,
      completedFocusCycles: 0,
      readerBook: null,
      manualBookOverrideInReader: false,
      notice: null,

      getEffectiveBook: () => resolveEffectiveBook(get()),

      getElapsedFocusSeconds: (nowMs = Date.now()) =>
        computeElapsedFocusSeconds(get(), nowMs),

      start: () => {
        const state = get();
        if (state.status === 'running') return;

        const nowMs = Date.now();
        if (state.status === 'paused') {
          const safeRemaining = Math.max(1, state.remainingSeconds);
          set({
            status: 'running',
            remainingSeconds: safeRemaining,
            targetEndMs: nowMs + safeRemaining * 1000,
            segmentStartedMs: nowMs,
            notice: null,
          });
          return;
        }

        const plannedSeconds = getPhaseMinutes(state.phase, state) * 60;
        const effectiveBook = resolveEffectiveBook(state);
        const nowDate = new Date(nowMs);

        set({
          status: 'running',
          plannedSeconds,
          remainingSeconds: plannedSeconds,
          targetEndMs: nowMs + plannedSeconds * 1000,
          accumulatedSeconds: 0,
          segmentStartedMs: nowMs,
          sessionStartedAtIso:
            state.phase === 'focus' ? nowDate.toISOString() : null,
          sessionLocalDate:
            state.phase === 'focus' ? formatLocalDateKey(nowDate) : null,
          sessionLocalHour:
            state.phase === 'focus' ? nowDate.getHours() : null,
          sessionItemId:
            state.phase === 'focus' ? (effectiveBook?.id ?? null) : null,
          sessionItemTitle:
            state.phase === 'focus' ? (effectiveBook?.title ?? null) : null,
          notice: null,
        });
      },

      pause: () => {
        const state = get();
        if (state.status !== 'running') return;

        const nowMs = Date.now();
        const segmentElapsed =
          state.segmentStartedMs !== null
            ? Math.max(0, Math.floor((nowMs - state.segmentStartedMs) / 1000))
            : 0;
        const nextAccumulated = Math.min(
          state.plannedSeconds,
          state.accumulatedSeconds + segmentElapsed,
        );
        const nextRemaining =
          state.targetEndMs !== null
            ? Math.max(1, Math.ceil((state.targetEndMs - nowMs) / 1000))
            : state.remainingSeconds;

        set({
          status: 'paused',
          accumulatedSeconds: nextAccumulated,
          remainingSeconds: nextRemaining,
          targetEndMs: null,
          segmentStartedMs: null,
        });
      },

      reset: () => {
        const state = get();
        const fullSeconds = getPhaseMinutes(state.phase, state) * 60;
        set({
          status: 'idle',
          plannedSeconds: fullSeconds,
          remainingSeconds: fullSeconds,
          targetEndMs: null,
          accumulatedSeconds: 0,
          segmentStartedMs: null,
          sessionStartedAtIso: null,
          sessionLocalDate: null,
          sessionLocalHour: null,
          sessionItemId: null,
          sessionItemTitle: null,
        });
      },

      selectPhase: (phase) => {
        const state = get();
        const fullSeconds = getPhaseMinutes(phase, state) * 60;
        set({
          phase,
          status: 'idle',
          plannedSeconds: fullSeconds,
          remainingSeconds: fullSeconds,
          targetEndMs: null,
          accumulatedSeconds: 0,
          segmentStartedMs: null,
          sessionStartedAtIso: null,
          sessionLocalDate: null,
          sessionLocalHour: null,
          sessionItemId: null,
          sessionItemTitle: null,
        });
      },

      skipPhase: () => {
        const state = get();
        const nextPhase: PomodoroPhase =
          state.phase === 'focus'
            ? (state.completedFocusCycles + 1) % state.cyclesBeforeLongBreak ===
              0
              ? 'long_break'
              : 'short_break'
            : 'focus';
        const fullSeconds = getPhaseMinutes(nextPhase, state) * 60;

        set({
          phase: nextPhase,
          status: 'idle',
          plannedSeconds: fullSeconds,
          remainingSeconds: fullSeconds,
          targetEndMs: null,
          accumulatedSeconds: 0,
          segmentStartedMs: null,
          sessionStartedAtIso: null,
          sessionLocalDate: null,
          sessionLocalHour: null,
          sessionItemId: null,
          sessionItemTitle: null,
        });
      },

      tick: (nowMs) => {
        const state = get();
        if (state.status !== 'running' || state.targetEndMs === null) {
          return null;
        }

        const nextRemaining = Math.max(
          0,
          Math.ceil((state.targetEndMs - nowMs) / 1000),
        );

        if (nextRemaining > 0) {
          if (nextRemaining !== state.remainingSeconds) {
            set({ remainingSeconds: nextRemaining });
          }
          return null;
        }

        if (state.phase === 'focus') {
          const endedDate = new Date(nowMs);
          const startedAtIso =
            state.sessionStartedAtIso ??
            new Date(nowMs - state.plannedSeconds * 1000).toISOString();
          const localDate =
            state.sessionLocalDate ?? formatLocalDateKey(endedDate);
          const localHour = state.sessionLocalHour ?? endedDate.getHours();

          const sessionPayload: CreateStudySessionInput = {
            item_id: state.sessionItemId,
            phase: 'focus',
            planned_seconds: state.plannedSeconds,
            duration_seconds: state.plannedSeconds,
            completed: true,
            started_at: startedAtIso,
            ended_at: endedDate.toISOString(),
            local_date: localDate,
            local_hour: localHour,
          };

          const nextCycles = state.completedFocusCycles + 1;
          const nextPhase: PomodoroPhase =
            nextCycles % state.cyclesBeforeLongBreak === 0
              ? 'long_break'
              : 'short_break';
          const nextMinutes = getPhaseMinutes(nextPhase, state);
          const nextSeconds = nextMinutes * 60;

          const notice: PomodoroNotice = {
            id: crypto.randomUUID(),
            kind: 'focus_complete',
            title: 'Sesión de enfoque completada',
            subtitle:
              nextPhase === 'long_break'
                ? `Descanso largo de ${nextMinutes} min listo.`
                : `Descanso corto de ${nextMinutes} min listo.`,
            nextPhase,
            nextMinutes,
          };

          set({
            phase: nextPhase,
            status: state.autoStartNext ? 'running' : 'idle',
            plannedSeconds: nextSeconds,
            remainingSeconds: nextSeconds,
            targetEndMs: state.autoStartNext ? nowMs + nextSeconds * 1000 : null,
            accumulatedSeconds: 0,
            segmentStartedMs: state.autoStartNext ? nowMs : null,
            sessionStartedAtIso: null,
            sessionLocalDate: null,
            sessionLocalHour: null,
            sessionItemId: null,
            sessionItemTitle: null,
            completedFocusCycles: nextCycles,
            notice,
          });

          return sessionPayload;
        }

        const nextMinutes = state.focusMinutes;
        const nextSeconds = nextMinutes * 60;
        const notice: PomodoroNotice = {
          id: crypto.randomUUID(),
          kind: 'break_complete',
          title: 'Descanso terminado',
          subtitle: `Bloque de enfoque de ${nextMinutes} min listo.`,
          nextPhase: 'focus',
          nextMinutes,
        };

        if (state.autoStartNext) {
          const startedDate = new Date(nowMs);
          const effectiveBook = resolveEffectiveBook(state);
          set({
            phase: 'focus',
            status: 'running',
            plannedSeconds: nextSeconds,
            remainingSeconds: nextSeconds,
            targetEndMs: nowMs + nextSeconds * 1000,
            accumulatedSeconds: 0,
            segmentStartedMs: nowMs,
            sessionStartedAtIso: startedDate.toISOString(),
            sessionLocalDate: formatLocalDateKey(startedDate),
            sessionLocalHour: startedDate.getHours(),
            sessionItemId: effectiveBook?.id ?? null,
            sessionItemTitle: effectiveBook?.title ?? null,
            notice,
          });
        } else {
          set({
            phase: 'focus',
            status: 'idle',
            plannedSeconds: nextSeconds,
            remainingSeconds: nextSeconds,
            targetEndMs: null,
            accumulatedSeconds: 0,
            segmentStartedMs: null,
            sessionStartedAtIso: null,
            sessionLocalDate: null,
            sessionLocalHour: null,
            sessionItemId: null,
            sessionItemTitle: null,
            notice,
          });
        }

        return null;
      },

      saveAndFinishPartial: () => {
        const state = get();
        const nowMs = Date.now();
        const elapsed = computeElapsedFocusSeconds(state, nowMs);
        if (state.phase !== 'focus' || state.status === 'idle' || elapsed < 60) {
          return null;
        }

        const endedDate = new Date(nowMs);
        const sessionPayload: CreateStudySessionInput = {
          item_id: state.sessionItemId,
          phase: 'focus',
          planned_seconds: state.plannedSeconds,
          duration_seconds: elapsed,
          completed: false,
          started_at:
            state.sessionStartedAtIso ??
            new Date(nowMs - elapsed * 1000).toISOString(),
          ended_at: endedDate.toISOString(),
          local_date: state.sessionLocalDate ?? formatLocalDateKey(endedDate),
          local_hour: state.sessionLocalHour ?? endedDate.getHours(),
        };

        const fullFocusSeconds = state.focusMinutes * 60;
        const elapsedMinutes = Math.max(1, Math.round(elapsed / 60));

        set({
          phase: 'focus',
          status: 'idle',
          plannedSeconds: fullFocusSeconds,
          remainingSeconds: fullFocusSeconds,
          targetEndMs: null,
          accumulatedSeconds: 0,
          segmentStartedMs: null,
          sessionStartedAtIso: null,
          sessionLocalDate: null,
          sessionLocalHour: null,
          sessionItemId: null,
          sessionItemTitle: null,
          notice: {
            id: crypto.randomUUID(),
            kind: 'saved_partial',
            title: 'Sesión guardada',
            subtitle: `${elapsedMinutes} min registrados en tus estadísticas.`,
          },
        });

        return sessionPayload;
      },

      setReaderBook: (book) => {
        const state = get();
        const prevId = state.readerBook?.id ?? null;
        const nextId = book?.id ?? null;

        if (prevId === nextId) {
          if (book && state.readerBook?.title !== book.title) {
            set({ readerBook: book });
          }
          return;
        }

        set({
          readerBook: book,
          manualBookOverrideInReader: false,
        });
      },

      setLinkedBook: (book) => {
        const state = get();
        const updates: Partial<PomodoroState> = {
          linkedItemId: book?.id ?? null,
          linkedItemTitle: book?.title ?? null,
        };

        if (state.readerBook) {
          updates.manualBookOverrideInReader = true;
        }

        if (state.status !== 'idle' && state.phase === 'focus') {
          updates.sessionItemId = book?.id ?? null;
          updates.sessionItemTitle = book?.title ?? null;
        }

        set(updates);
      },

      applyPreset: (focusMinutes, shortBreakMinutes, longBreakMinutes) => {
        get().updateSettings({
          focusMinutes,
          shortBreakMinutes,
          longBreakMinutes,
        });
      },

      updateSettings: (patch) => {
        const state = get();
        const nextFocus =
          patch.focusMinutes !== undefined
            ? clampMinutes(patch.focusMinutes, 1, 180)
            : state.focusMinutes;
        const nextShort =
          patch.shortBreakMinutes !== undefined
            ? clampMinutes(patch.shortBreakMinutes, 1, 60)
            : state.shortBreakMinutes;
        const nextLong =
          patch.longBreakMinutes !== undefined
            ? clampMinutes(patch.longBreakMinutes, 1, 90)
            : state.longBreakMinutes;
        const nextCycles =
          patch.cyclesBeforeLongBreak !== undefined
            ? clampMinutes(patch.cyclesBeforeLongBreak, 2, 8)
            : state.cyclesBeforeLongBreak;

        const updates: Partial<PomodoroState> = {
          focusMinutes: nextFocus,
          shortBreakMinutes: nextShort,
          longBreakMinutes: nextLong,
          cyclesBeforeLongBreak: nextCycles,
          soundEnabled: patch.soundEnabled ?? state.soundEnabled,
          autoStartNext: patch.autoStartNext ?? state.autoStartNext,
        };

        if (state.status === 'idle' && state.accumulatedSeconds === 0) {
          const nextSeconds =
            getPhaseMinutes(state.phase, {
              focusMinutes: nextFocus,
              shortBreakMinutes: nextShort,
              longBreakMinutes: nextLong,
            }) * 60;
          updates.plannedSeconds = nextSeconds;
          updates.remainingSeconds = nextSeconds;
        }

        set(updates);
      },

      dismissNotice: () => set({ notice: null }),
    }),
    {
      name: 'librory-pomodoro-v1',
      version: 1,
      partialize: (state) => ({
        focusMinutes: state.focusMinutes,
        shortBreakMinutes: state.shortBreakMinutes,
        longBreakMinutes: state.longBreakMinutes,
        cyclesBeforeLongBreak: state.cyclesBeforeLongBreak,
        soundEnabled: state.soundEnabled,
        autoStartNext: state.autoStartNext,
        linkedItemId: state.linkedItemId,
        linkedItemTitle: state.linkedItemTitle,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.status === 'idle' && state.accumulatedSeconds === 0) {
          const fullSeconds = getPhaseMinutes(state.phase, state) * 60;
          state.plannedSeconds = fullSeconds;
          state.remainingSeconds = fullSeconds;
        }
      },
    },
  ),
);
