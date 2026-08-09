import { mulberry32, randInt } from "@/lib/random";
import type { Baseline } from "@/lib/vision/calibration";
import { motionThreshold } from "@/lib/vision/calibration";
import type { PlayerResult } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/**
 * Freeze!: dance during MOVE!, then hold perfectly still when FREEZE!
 * lands at a deterministic moment. Movement during the freeze window is
 * penalized — but only movement above the player's own calibrated noise
 * floor, so a grainy webcam doesn't read as fidgeting.
 */

export const ROUNDS = 3;
export const CALIBRATION_MS = 2500;
export const MIN_MOVE_MS = 3000;
export const MAX_MOVE_MS = 6500;
export const FREEZE_MS = 3000;
export const REVEAL_MS = 2500;

export interface FreezeRound {
  moveMs: number;
}

export function createRounds(seed: number): FreezeRound[] {
  const rng = mulberry32(seed);
  return Array.from({ length: ROUNDS }, () => ({
    moveMs: randInt(rng, MIN_MOVE_MS, MAX_MOVE_MS),
  }));
}

export interface FreezeSlot {
  moveAt: number;
  freezeAt: number;
  revealAt: number;
  endAt: number;
}

/** Schedule is shared: calibration first, then each round back to back. */
export function buildSchedule(startAt: number, rounds: FreezeRound[]): FreezeSlot[] {
  const slots: FreezeSlot[] = [];
  let t = startAt + CALIBRATION_MS;
  for (const round of rounds) {
    const moveAt = t;
    const freezeAt = moveAt + round.moveMs;
    const revealAt = freezeAt + FREEZE_MS;
    const endAt = revealAt + REVEAL_MS;
    slots.push({ moveAt, freezeAt, revealAt, endAt });
    t = endAt;
  }
  return slots;
}

/**
 * Score one freeze window from per-frame motion samples. Motion within
 * the noise floor is free; everything above it accumulates.
 */
export function scoreFreezeWindow(samples: number[], baseline: Baseline): number {
  const threshold = motionThreshold(baseline);
  let excess = 0;
  for (const sample of samples) {
    if (sample > threshold) excess += sample - threshold;
  }
  // Per-frame average keeps the score independent of frame rate.
  const perFrame = samples.length > 0 ? excess / samples.length : 0;
  return Math.round(perFrame * 100000) / 100000;
}

/** 0–100 where perfectly still is 100. */
export function freezeScore(excessPerFrame: number): number {
  return Math.max(0, Math.min(100, 100 - excessPerFrame * 2500));
}

export function freezeResult(windowScores: number[]): PlayerResult {
  const scored = windowScores.filter((s) => Number.isFinite(s));
  const totalExcess = scored.reduce((a, b) => a + b, 0);
  const perRound = scored.length > 0 ? totalExcess / scored.length : 0;
  const normalized = freezeScore(perRound);
  return {
    rawScore: Math.round(totalExcess * 100000) / 100000,
    normalizedScore: Math.round(normalized * 10) / 10,
    completed: scored.length >= ROUNDS,
    detail: {
      totalMovement: Math.round(totalExcess * 100000) / 100000,
      roundsScored: scored.length,
      steadiest: scored.length > 0 ? Math.round(Math.min(...scored) * 100000) / 100000 : 0,
    },
  };
}

/** Lowest movement wins; incomplete rounds lose. */
export function decideFreezeWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.completed !== p2.completed) return p1.completed ? "player1" : "player2";
  if (p1.rawScore === p2.rawScore) return null;
  return p1.rawScore < p2.rawScore ? "player1" : "player2";
}

/** Playful copy for how badly someone twitched. */
export function freezeFeedback(score: number): string {
  if (score >= 95) return "Statue. Genuinely unsettling.";
  if (score >= 80) return "Barely a flicker.";
  if (score >= 60) return "A little wobbly.";
  if (score >= 35) return "That was definitely dancing.";
  return "You did NOT freeze. 😂";
}
