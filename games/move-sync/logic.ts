import { mulberry32, pick } from "@/lib/random";
import { POSE_TEMPLATES, type PoseTemplate } from "@/lib/vision/poses";
import { getPoseTemplate } from "@/lib/vision/poses";
import type { PlayerResult } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/**
 * Move Sync: a short choreography of poses hit on a beat. Each beat is
 * graded on how well the pose matched AND how close to the beat it was
 * hit — a lightweight rhythm game rather than real dancing.
 */

export const BPM = 100;
export const BEAT_MS = (60 / BPM) * 1000 * 2; // one move per two beats
export const LEAD_IN_BEATS = 4;
/** How far from the beat still counts, in ms. */
export const TIMING_WINDOW_MS = 700;
export const REVEAL_MS = 3000;

export type Judgement = "perfect" | "good" | "late" | "miss";

export interface Choreography {
  name: string;
  steps: string[];
}

/**
 * Sequences are built from existing pose templates, so choreography and
 * Pose Perfect share the same scoring path.
 */
const SEQUENCES: Choreography[] = [
  {
    name: "Wake Up",
    steps: ["t_pose", "arms_overhead", "star", "squat", "arms_overhead", "t_pose"],
  },
  {
    name: "Teapot Shuffle",
    steps: ["t_pose", "lean_left", "t_pose", "flex", "star", "squat"],
  },
  {
    name: "Disco Drill",
    steps: ["disco", "arms_overhead", "disco", "star", "flex", "arms_overhead"],
  },
  {
    name: "Star Jump",
    steps: ["squat", "star", "squat", "star", "arms_overhead", "t_pose"],
  },
];

export function selectChoreography(seed: number): Choreography {
  return pick(mulberry32(seed), SEQUENCES);
}

export function stepTemplates(choreo: Choreography): PoseTemplate[] {
  return choreo.steps
    .map(getPoseTemplate)
    .filter((t): t is PoseTemplate => t !== null);
}

/** Absolute time of each beat, given the game start. */
export function beatTimes(startAt: number, stepCount: number): number[] {
  const first = startAt + LEAD_IN_BEATS * BEAT_MS;
  return Array.from({ length: stepCount }, (_, i) => first + i * BEAT_MS);
}

export function endTime(startAt: number, stepCount: number): number {
  const beats = beatTimes(startAt, stepCount);
  return beats[beats.length - 1] + TIMING_WINDOW_MS + REVEAL_MS;
}

/**
 * Grade one beat. `bestScore` is the best pose similarity seen inside the
 * timing window; `bestOffsetMs` is how far from the beat that peak landed
 * (negative = early).
 */
export function judgeBeat(bestScore: number, bestOffsetMs: number): Judgement {
  if (bestScore < 45) return "miss";
  const offset = Math.abs(bestOffsetMs);
  if (offset > TIMING_WINDOW_MS) return "miss";
  if (bestScore >= 75 && offset <= 250) return "perfect";
  if (bestScore >= 60 && offset <= 450) return "good";
  return "late";
}

export const JUDGEMENT_POINTS: Record<Judgement, number> = {
  perfect: 100,
  good: 75,
  late: 45,
  miss: 0,
};

export const JUDGEMENT_COPY: Record<Judgement, { label: string; className: string }> = {
  perfect: { label: "PERFECT", className: "text-go" },
  good: { label: "GOOD", className: "text-rose-soft" },
  late: { label: "LATE", className: "text-peach" },
  miss: { label: "MISS", className: "text-danger" },
};

export function moveSyncResult(judgements: Judgement[], stepCount: number): PlayerResult {
  const points = judgements.reduce((a, j) => a + JUDGEMENT_POINTS[j], 0);
  const normalized = stepCount > 0 ? points / stepCount : 0;
  const perfects = judgements.filter((j) => j === "perfect").length;
  return {
    rawScore: points,
    normalizedScore: Math.round(Math.max(0, Math.min(100, normalized)) * 10) / 10,
    completed: judgements.length >= stepCount,
    detail: {
      perfects,
      misses: judgements.filter((j) => j === "miss").length,
      beatsJudged: judgements.length,
    },
  };
}

/** Highest score wins; more PERFECTs breaks a tie. */
export function decideMoveSyncWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.normalizedScore !== p2.normalizedScore) {
    return p1.normalizedScore > p2.normalizedScore ? "player1" : "player2";
  }
  const a = typeof p1.detail?.perfects === "number" ? p1.detail.perfects : 0;
  const b = typeof p2.detail?.perfects === "number" ? p2.detail.perfects : 0;
  if (a !== b) return a > b ? "player1" : "player2";
  return null;
}

/** All templates referenced by choreography must exist. */
export function allSequences(): Choreography[] {
  return SEQUENCES;
}

export function knownTemplateIds(): string[] {
  return POSE_TEMPLATES.map((t) => t.id);
}
