// "Housekeeping tablet chimes" (§15 Sprint 2 exit test) — a short two-tone
// beep via the Web Audio API rather than shipping/committing an audio asset.
// Call only from a client-side event handler or effect.
export function playChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    [880, 1320].forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = freq;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      const start = now + i * 0.15;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      oscillator.start(start);
      oscillator.stop(start + 0.15);
    });
  } catch {
    // Audio isn't essential — a silent tablet still shows the new request visually.
  }
}
