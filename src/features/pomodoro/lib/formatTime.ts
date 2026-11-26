/**
 * Formats seconds as MM:SS (or H:MM:SS when >= 1 hour).
 */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats focused duration compactly for summary metrics (e.g. "12h 35m", "45 min", "< 1 min", "0 min").
 */
export function formatDurationCompact(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.round(totalSeconds))
    : 0;
  if (safe === 0) return '0 min';
  if (safe < 60) return '< 1 min';

  const totalMinutes = Math.round(safe / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Formats an integer hour (0-23) as HH:00, or an em-dash when absent.
 */
export function formatPeakHour(hour: number | null): string {
  if (hour === null || !Number.isFinite(hour)) return '—';
  const clamped = Math.min(23, Math.max(0, Math.floor(hour)));
  return `${String(clamped).padStart(2, '0')}:00`;
}

export interface ParsedPomodoroDuration {
  totalSeconds: number;
  preferenceMinutes: number;
}

/**
 * Parses user-typed Pomodoro durations in plain minutes ("40"), "MM:SS" ("45:30"),
 * or "H:MM:SS" ("1:30:00"), clamping within [minMinutes, maxMinutes].
 */
export function parsePomodoroDurationInput(
  raw: string,
  minMinutes: number,
  maxMinutes: number,
): ParsedPomodoroDuration | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const minSec = Math.max(60, Math.round(minMinutes) * 60);
  const maxSec = Math.max(minSec, Math.round(maxMinutes) * 60);

  let rawSeconds: number | null = null;

  const plainMatch = /^(\d+)$/.exec(trimmed);
  if (plainMatch) {
    const mins = Number.parseInt(plainMatch[1]!, 10);
    if (Number.isFinite(mins) && mins > 0) {
      rawSeconds = mins * 60;
    }
  } else {
    const mmssMatch = /^(\d+):(\d{1,2})$/.exec(trimmed);
    if (mmssMatch) {
      const mm = Number.parseInt(mmssMatch[1]!, 10);
      const ss = Number.parseInt(mmssMatch[2]!, 10);
      if (Number.isFinite(mm) && Number.isFinite(ss) && ss < 60) {
        const total = mm * 60 + ss;
        if (total > 0) rawSeconds = total;
      }
    } else {
      const hmmssMatch = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(trimmed);
      if (hmmssMatch) {
        const hh = Number.parseInt(hmmssMatch[1]!, 10);
        const mm = Number.parseInt(hmmssMatch[2]!, 10);
        const ss = Number.parseInt(hmmssMatch[3]!, 10);
        if (
          Number.isFinite(hh) &&
          Number.isFinite(mm) &&
          Number.isFinite(ss) &&
          mm < 60 &&
          ss < 60
        ) {
          const total = hh * 3600 + mm * 60 + ss;
          if (total > 0) rawSeconds = total;
        }
      }
    }
  }

  if (rawSeconds === null || !Number.isFinite(rawSeconds)) {
    return null;
  }

  const totalSeconds = Math.min(maxSec, Math.max(minSec, rawSeconds));
  const preferenceMinutes = Math.min(
    maxMinutes,
    Math.max(minMinutes, Math.floor(totalSeconds / 60)),
  );

  return { totalSeconds, preferenceMinutes };
}
