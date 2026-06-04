// Lightweight notification chime, synthesized with the Web Audio API so it
// needs no audio asset and stays crisp at any volume. Produces a modern
// two-note "bell" (a perfect fifth) with a soft exponential decay.
//
// Browsers require a user gesture before audio can play. We lazily create /
// resume the AudioContext, and `primeNotificationSound()` should be called from
// a click handler (e.g. the "Enable notifications" button) so later
// programmatic plays are allowed.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** Resume the audio context from within a user gesture so future plays work. */
export function primeNotificationSound(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peak: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startAt);

  // Quick attack, smooth exponential release for a bell-like ring.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Play the notification chime. No-op when audio is unavailable/blocked. */
export function playNotificationChime(): void {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // Two-note motif: C6 then G6 (a bright, friendly "ding-dong").
    playTone(ctx, 1046.5, now, 0.5, 0.18);
    playTone(ctx, 1567.98, now + 0.13, 0.55, 0.16);
  } catch {
    /* ignore audio failures */
  }
}
