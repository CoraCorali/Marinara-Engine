// ──────────────────────────────────────────────
// Fork: weather sounds, made in the browser (see FORK.md)
// ──────────────────────────────────────────────
// No audio files: rain, wind, thunder and a fire's crackle are all shaped from one loop of noise
// through filters. Everything fades in and out rather than switching, so a change of weather sounds
// like weather changing.
import type { WeatherSoundScene } from "./weather-prefs";

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  const scope = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Seconds a level takes to settle, so changes glide instead of click. */
const GLIDE = 1.2;

export class WeatherSoundEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private rain: GainNode;
  private wind: GainNode;
  private windFilter: BiquadFilterNode;
  private noise: AudioBuffer;
  private sources: AudioScheduledSourceNode[] = [];
  private scene: WeatherSoundScene = { rain: 0, wind: 0, thunder: false, crackle: false };
  private thunderTimer: ReturnType<typeof setTimeout> | null = null;
  private crackleTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  static create(): WeatherSoundEngine | null {
    const Context = audioContextCtor();
    return Context ? new WeatherSoundEngine(new Context()) : null;
  }

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Two seconds of white noise, looped: the raw material for everything.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;

    // Rain: the hiss of noise with the rumble and the shrill end cut away.
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    const rainHigh = ctx.createBiquadFilter();
    rainHigh.type = "highpass";
    rainHigh.frequency.value = 700;
    const rainLow = ctx.createBiquadFilter();
    rainLow.type = "lowpass";
    rainLow.frequency.value = 7000;
    this.loop().connect(rainHigh).connect(rainLow).connect(this.rain).connect(this.master);

    // Wind: low noise whose brightness rises and falls slowly, like gusts.
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "lowpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 6;
    const gusts = ctx.createOscillator();
    gusts.frequency.value = 0.09;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 260;
    gusts.connect(gustDepth).connect(this.windFilter.frequency);
    gusts.start();
    this.sources.push(gusts);
    this.loop().connect(this.windFilter).connect(this.wind).connect(this.master);
  }

  private loop(): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.start();
    this.sources.push(source);
    return source;
  }

  /** A short burst of filtered noise with its own envelope: a crackle, or a roll of thunder. */
  private burst(options: { filter: BiquadFilterType; frequency: number; peak: number; attack: number; decay: number }) {
    if (this.closed) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = options.filter;
    filter.frequency.value = options.frequency;
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(options.peak, now + options.attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + options.attack + options.decay);
    source.connect(filter).connect(envelope).connect(this.master);
    source.start(now, Math.random() * 1.5);
    source.stop(now + options.attack + options.decay + 0.1);
  }

  private scheduleThunder() {
    if (this.thunderTimer || !this.scene.thunder || this.closed) return;
    this.thunderTimer = setTimeout(
      () => {
        this.thunderTimer = null;
        if (!this.scene.thunder) return;
        this.burst({ filter: "lowpass", frequency: 110, peak: 0.9, attack: 0.25, decay: 3.5 + Math.random() * 2 });
        this.scheduleThunder();
      },
      9000 + Math.random() * 16000,
    );
  }

  private scheduleCrackle() {
    if (this.crackleTimer || !this.scene.crackle || this.closed) return;
    this.crackleTimer = setTimeout(
      () => {
        this.crackleTimer = null;
        if (!this.scene.crackle) return;
        this.burst({
          filter: "bandpass",
          frequency: 1800 + Math.random() * 2500,
          peak: 0.15 + Math.random() * 0.35,
          attack: 0.002,
          decay: 0.03 + Math.random() * 0.06,
        });
        this.scheduleCrackle();
      },
      40 + Math.random() * 380,
    );
  }

  /** Fade towards a new soundscape. */
  setScene(scene: WeatherSoundScene) {
    this.scene = scene;
    const now = this.ctx.currentTime;
    this.rain.gain.setTargetAtTime(scene.rain * 0.55, now, GLIDE);
    this.wind.gain.setTargetAtTime(scene.wind * 0.7, now, GLIDE);
    if (!scene.thunder && this.thunderTimer) {
      clearTimeout(this.thunderTimer);
      this.thunderTimer = null;
    }
    if (!scene.crackle && this.crackleTimer) {
      clearTimeout(this.crackleTimer);
      this.crackleTimer = null;
    }
    this.scheduleThunder();
    this.scheduleCrackle();
  }

  setVolume(volume: number) {
    this.master.gain.setTargetAtTime(Math.min(1, Math.max(0, volume)) * 0.6, this.ctx.currentTime, 0.4);
  }

  /** Browsers start audio suspended until the page has been touched; this is called on a touch. */
  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Pause while the tab is hidden, so a forgotten tab is not humming away. */
  setHidden(hidden: boolean) {
    if (hidden) void this.ctx.suspend();
    else this.resume();
  }

  close() {
    this.closed = true;
    if (this.thunderTimer) clearTimeout(this.thunderTimer);
    if (this.crackleTimer) clearTimeout(this.crackleTimer);
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    void this.ctx.close();
  }
}
