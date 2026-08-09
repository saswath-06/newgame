/**
 * Self-calibrating thresholds.
 *
 * Absolute cutoffs for "did they move?" and "are they wobbling?" don't
 * transfer between devices — a grainy webcam in dim light jitters several
 * times more than a good sensor, and MediaPipe's noise floor moves with
 * both. Rather than hardcode numbers measured on one machine, each player
 * samples their own baseline while deliberately holding still, and
 * thresholds are derived from that.
 */

export interface Baseline {
  /** Median per-frame noise while holding still. */
  median: number;
  /** Upper edge of ordinary noise (95th percentile). */
  noiseCeiling: number;
  samples: number;
}

/** Fallbacks used when calibration was skipped or produced too few frames. */
export const DEFAULT_BASELINE: Baseline = {
  median: 0.004,
  noiseCeiling: 0.012,
  samples: 0,
};

const MIN_SAMPLES = 12;

export function buildBaseline(samples: number[]): Baseline {
  const clean = samples.filter((s) => Number.isFinite(s) && s >= 0).sort((a, b) => a - b);
  if (clean.length < MIN_SAMPLES) return DEFAULT_BASELINE;
  const at = (q: number) => clean[Math.min(clean.length - 1, Math.floor(clean.length * q))];
  return {
    median: at(0.5),
    noiseCeiling: at(0.95),
    samples: clean.length,
  };
}

/**
 * Movement above this counts as real motion rather than sensor noise.
 * Floored so a suspiciously quiet baseline can't make the game
 * impossible, and capped so a noisy one can't make it trivial.
 */
export function motionThreshold(baseline: Baseline): number {
  const derived = baseline.noiseCeiling * 1.8;
  return Math.min(0.05, Math.max(0.008, derived));
}

/** Sway bands for balance games: [steady, wobbling] upper bounds. */
export function swayThresholds(baseline: Baseline): {
  steady: number;
  wobbling: number;
} {
  const unit = Math.max(0.006, baseline.noiseCeiling);
  return {
    steady: Math.min(0.05, unit * 2.5),
    wobbling: Math.min(0.12, unit * 6),
  };
}

/**
 * Collects baseline samples over a calibration window. Feed it one motion
 * value per frame; ask for the baseline when the window closes.
 */
export class BaselineCollector {
  private samples: number[] = [];

  add(motion: number): void {
    if (Number.isFinite(motion) && motion >= 0) this.samples.push(motion);
    if (this.samples.length > 300) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  build(): Baseline {
    return buildBaseline(this.samples);
  }

  reset(): void {
    this.samples = [];
  }
}
