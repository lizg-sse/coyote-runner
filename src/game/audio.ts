/**
 * Tiny synthesized sound effects. Audio contexts must be created from a user
 * gesture on phones, so `unlock()` is called from the Play button.
 */
export interface Beeper {
  unlock(): void;
  play(frequency: number, duration: number, volume: number): void;
}

export function createBeeper(): Beeper {
  let context: AudioContext | null = null;

  function ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  }

  return {
    unlock: () => {
      ensure();
    },
    play: (frequency, duration, volume) => {
      const ctx = ensure();
      if (!ctx || ctx.state !== "running") return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      oscillator.stop(ctx.currentTime + duration);
    },
  };
}
