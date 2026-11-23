/**
 * Formats seconds as MM:SS (or H:MM:SS when >= 1 hour).
 */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
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
  const safe = Math.max(0, Math.round(totalSeconds));
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
