let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

function scheduleBellNote(
  ctx: AudioContext,
  frequency: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain = 0.12,
): void {
  const startTime = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.05);
}

/**
 * Plays a gentle synthesized bell chime using Web Audio API without external audio assets.
 */
export function playPomodoroChime(
  kind: 'focus_complete' | 'break_complete',
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    if (kind === 'focus_complete') {
      // Soft ascending C5 - E5 - G5 chime
      scheduleBellNote(ctx, 523.25, 0, 0.55, 0.11);
      scheduleBellNote(ctx, 659.25, 0.16, 0.65, 0.12);
      scheduleBellNote(ctx, 783.99, 0.32, 0.9, 0.12);
    } else {
      // Soft descending E5 - C5 chime
      scheduleBellNote(ctx, 659.25, 0, 0.5, 0.1);
      scheduleBellNote(ctx, 523.25, 0.18, 0.75, 0.11);
    }
  } catch {
    // Ignore audio context errors when autoplay or audio hardware is restricted.
  }
}
