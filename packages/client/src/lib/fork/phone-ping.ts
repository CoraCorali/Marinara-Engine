// Fork: Pocket Phone — a soft two-note ping (and a short buzz where the device can) when a text or
// call comes in (see FORK.md). Made with Web Audio, so there is no sound file to ship.

let context: AudioContext | null = null;

export function playPhonePing(): void {
  try {
    navigator.vibrate?.([60, 40, 60]);
  } catch {
    // No vibration motor, or the browser said no.
  }
  try {
    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    context ??= new Context();
    // Browsers keep audio asleep until a tap; a ping before the first tap is silent.
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    for (const [offset, frequency] of [
      [0, 1318.5],
      [0.12, 1760],
    ] as const) {
      const tone = context.createOscillator();
      const volume = context.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, start + offset);
      volume.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
      tone.connect(volume).connect(context.destination);
      tone.start(start + offset);
      tone.stop(start + offset + 0.25);
    }
  } catch {
    // Audio unavailable: the badge still shows.
  }
}
