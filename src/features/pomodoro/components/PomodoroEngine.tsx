import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { libraryKeys } from '@/features/library/hooks/useLibraryData';
import { formatClock } from '@/features/pomodoro/lib/formatTime';
import { playPomodoroChime } from '@/features/pomodoro/lib/pomodoroSound';
import { isTauriRuntime } from '@/services/db';
import { createStudySession } from '@/services/studySessionRepository';
import { usePomodoroStore } from '@/store/pomodoroStore';
import type { PomodoroPhase } from '@/types/domain';

const PHASE_TITLE_LABELS: Record<PomodoroPhase, string> = {
  focus: 'Enfoque',
  short_break: 'Descanso',
  long_break: 'Descanso largo',
};

/**
 * Headless global Pomodoro ticker, SQLite persistence handler, chime trigger, and title sync.
 * Mounted once at the App root so timers continue running seamlessly across views and readers.
 */
export function PomodoroEngine() {
  const queryClient = useQueryClient();
  const status = usePomodoroStore((s) => s.status);
  const phase = usePomodoroStore((s) => s.phase);
  const remainingSeconds = usePomodoroStore((s) => s.remainingSeconds);
  const soundEnabled = usePomodoroStore((s) => s.soundEnabled);
  const notice = usePomodoroStore((s) => s.notice);

  const lastChimedNoticeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'running') return;

    const runTick = () => {
      const completedSession = usePomodoroStore.getState().tick(Date.now());
      if (completedSession && isTauriRuntime()) {
        void createStudySession(completedSession)
          .then(() =>
            Promise.all([
              queryClient.invalidateQueries({
                queryKey: libraryKeys.studyStatsRoot,
              }),
              queryClient.invalidateQueries({ queryKey: libraryKeys.stats }),
            ]),
          )
          .catch((error: unknown) => {
            console.error('No se pudo guardar la sesión de estudio:', error);
          });
      }
    };

    runTick();
    const intervalId = window.setInterval(runTick, 250);
    return () => window.clearInterval(intervalId);
  }, [status, queryClient]);

  useEffect(() => {
    if (!notice) return;
    if (notice.id === lastChimedNoticeIdRef.current) return;
    if (notice.kind === 'focus_complete' || notice.kind === 'break_complete') {
      lastChimedNoticeIdRef.current = notice.id;
      if (soundEnabled) {
        playPomodoroChime(notice.kind);
      }
    }
  }, [notice, soundEnabled]);

  useEffect(() => {
    if (status === 'running') {
      document.title = `${formatClock(remainingSeconds)} · ${PHASE_TITLE_LABELS[phase]} — Librory`;
      return;
    }
    document.title = 'Librory';
  }, [status, phase, remainingSeconds]);

  useEffect(() => {
    return () => {
      document.title = 'Librory';
    };
  }, []);

  return null;
}
