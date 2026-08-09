import { mulberry32, shuffle } from "@/lib/random";
import { BALANCE_TEMPLATES, type PoseTemplate } from "@/lib/vision/poses";
import type { Baseline } from "@/lib/vision/calibration";
import { swayThresholds } from "@/lib/vision/calibration";
import type { PlayerResult } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/**
 * Balance Battle: hold a one-legged pose as long as you can. The clock
 * only starts once the pose is actually detected, so slow starters aren't
 * punished, and rounds are capped so a genuinely good balancer doesn't
 * stall the match.
 */

export const ROUNDS = 2;
export const CALIBRATION_MS = 2500;
/** Time allowed to get into the pose before the round is forfeited. */
export const ENTRY_GRACE_MS = 12000;
/** Maximum credited hold per round. */
export const MAX_HOLD_MS = 20000;
export const REVEAL_MS = 2500;
/** Similarity at or above this counts as holding the pose. */
export const POSE_VALID_SCORE = 55;
/** Consecutive invalid frames before the hold is declared over. */
export const LOST_FRAMES = 8;

export type BalanceState = "waiting" | "holding" | "wobbling" | "lost";

export function selectPoses(seed: number): PoseTemplate[] {
  const rng = mulberry32(seed);
  const shuffled = shuffle(rng, BALANCE_TEMPLATES);
  return Array.from({ length: ROUNDS }, (_, i) => shuffled[i % shuffled.length]);
}

/**
 * Live form feedback from pose similarity and body sway. Sway bands come
 * from the player's own calibrated noise floor.
 */
export function evaluateForm(
  similarity: number,
  sway: number,
  baseline: Baseline,
): BalanceState {
  if (similarity < POSE_VALID_SCORE) return "lost";
  const bands = swayThresholds(baseline);
  if (sway > bands.wobbling) return "lost";
  if (sway > bands.steady) return "wobbling";
  return "holding";
}

export function balanceResult(holdMs: number[]): PlayerResult {
  const holds = holdMs.filter((h) => Number.isFinite(h) && h >= 0);
  const total = holds.reduce((a, b) => a + b, 0);
  const maxPossible = ROUNDS * MAX_HOLD_MS;
  const normalized = Math.max(0, Math.min(100, (total / maxPossible) * 100));
  return {
    rawScore: Math.round(total),
    normalizedScore: Math.round(normalized * 10) / 10,
    completed: holds.length >= ROUNDS,
    detail: {
      totalHoldMs: Math.round(total),
      bestHoldMs: holds.length > 0 ? Math.round(Math.max(...holds)) : 0,
      roundsScored: holds.length,
    },
  };
}

/** Longest total hold wins; best single hold breaks ties. */
export function decideBalanceWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.rawScore !== p2.rawScore) {
    return p1.rawScore > p2.rawScore ? "player1" : "player2";
  }
  const b1 = typeof p1.detail?.bestHoldMs === "number" ? p1.detail.bestHoldMs : 0;
  const b2 = typeof p2.detail?.bestHoldMs === "number" ? p2.detail.bestHoldMs : 0;
  if (b1 !== b2) return b1 > b2 ? "player1" : "player2";
  return null;
}

export const STATE_COPY: Record<BalanceState, { label: string; className: string }> = {
  waiting: { label: "GET INTO POSE", className: "text-muted" },
  holding: { label: "FORM GOOD", className: "text-go" },
  wobbling: { label: "WOBBLING", className: "text-peach" },
  lost: { label: "POSE LOST", className: "text-danger" },
};
