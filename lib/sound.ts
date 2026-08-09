"use client";

/**
 * Lightweight WebAudio sound manager — all effects are synthesized, so no
 * audio assets are required. The AudioContext is created lazily on first
 * user interaction (browsers block earlier autoplay). Replace synth calls
 * with sampled assets later by swapping the play() table.
 */

export type SoundName =
  | "hover"
  | "click"
  | "join"
  | "ready"
  | "countdown"
  | "go"
  | "point"
  | "correct"
  | "incorrect"
  | "false_start"
  | "victory"
  | "defeat"
  | "round_win"
  | "round_lose";

const STORAGE_KEY = "duoarcade:sound";

interface SoundSettings {
  muted: boolean;
  volume: number; // 0..1
}

function loadSettings(): SoundSettings {
  if (typeof window === "undefined") return { muted: false, volume: 0.6 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundSettings>;
      return {
        muted: Boolean(parsed.muted),
        volume:
          typeof parsed.volume === "number"
            ? Math.min(1, Math.max(0, parsed.volume))
            : 0.6,
      };
    }
  } catch {
    // fall through to defaults
  }
  return { muted: false, volume: 0.6 };
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private settings: SoundSettings = loadSettings();
  private listeners = new Set<() => void>();

  get muted() {
    return this.settings.muted;
  }

  get volume() {
    return this.settings.volume;
  }

  setMuted(muted: boolean) {
    this.settings = { ...this.settings, muted };
    this.persist();
  }

  setVolume(volume: number) {
    this.settings = { ...this.settings, volume: Math.min(1, Math.max(0, volume)) };
    this.persist();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // storage unavailable — settings stay in-memory
    }
    for (const l of this.listeners) l();
  }

  /** Must be called from a user gesture at least once. */
  private context(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number,
    startIn: number,
    duration: number,
    type: OscillatorType = "sine",
    gainScale = 1,
  ) {
    const ctx = this.context();
    if (!ctx || this.settings.muted) return;
    const t0 = ctx.currentTime + startIn;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    const peak = 0.18 * this.settings.volume * gainScale;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  play(name: SoundName) {
    switch (name) {
      case "hover":
        this.tone(660, 0, 0.05, "sine", 0.35);
        break;
      case "click":
        this.tone(520, 0, 0.08, "triangle", 0.7);
        break;
      case "join":
        this.tone(440, 0, 0.12, "sine");
        this.tone(660, 0.1, 0.16, "sine");
        break;
      case "ready":
        this.tone(587, 0, 0.1, "triangle");
        this.tone(880, 0.09, 0.14, "triangle");
        break;
      case "countdown":
        this.tone(440, 0, 0.12, "square", 0.5);
        break;
      case "go":
        this.tone(880, 0, 0.25, "square", 0.7);
        break;
      case "point":
        this.tone(784, 0, 0.09, "triangle");
        this.tone(1047, 0.07, 0.12, "triangle");
        break;
      case "correct":
        this.tone(659, 0, 0.08, "sine");
        this.tone(988, 0.06, 0.1, "sine");
        break;
      case "incorrect":
        this.tone(220, 0, 0.18, "sawtooth", 0.5);
        break;
      case "false_start":
        this.tone(196, 0, 0.3, "sawtooth", 0.6);
        this.tone(147, 0.12, 0.3, "sawtooth", 0.6);
        break;
      case "round_win":
        this.tone(523, 0, 0.12, "triangle");
        this.tone(659, 0.1, 0.12, "triangle");
        this.tone(784, 0.2, 0.2, "triangle");
        break;
      case "round_lose":
        this.tone(392, 0, 0.15, "sine", 0.6);
        this.tone(311, 0.13, 0.25, "sine", 0.6);
        break;
      case "victory":
        this.tone(523, 0, 0.14, "triangle");
        this.tone(659, 0.12, 0.14, "triangle");
        this.tone(784, 0.24, 0.14, "triangle");
        this.tone(1047, 0.36, 0.4, "triangle");
        break;
      case "defeat":
        this.tone(440, 0, 0.2, "sine", 0.7);
        this.tone(349, 0.18, 0.2, "sine", 0.7);
        this.tone(262, 0.36, 0.4, "sine", 0.7);
        break;
    }
  }
}

export const soundManager = new SoundManager();
