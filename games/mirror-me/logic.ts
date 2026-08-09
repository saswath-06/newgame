import { comparePoses, mirrorAngles } from "@/lib/vision/math";
import type { PlayerResult } from "@/types/game";
import type { PoseAngles } from "@/types/vision";
import type { PlayerRole } from "@/types/player";

/**
 * Mirror Me: one player leads, the other mirrors. The leader's normalized
 * pose ANGLES are streamed to the mirror (never camera frames), and the
 * mirror is scored continuously on how well they match — after flipping
 * left/right, since a mirror image reverses sides.
 *
 * Both players lead once; you're scored only on your turn as the mirror.
 */

export const LEAD_MS = 15000;
export const INTERMISSION_MS = 3500;
export const SAMPLE_INTERVAL_MS = 100;
/** Streaming rate for the leader's angles. */
export const BROADCAST_MS = 120;
/** Similarity at or above this extends the streak. */
export const STREAK_THRESHOLD = 70;

export type MirrorPhase = "intro" | "round1" | "swap" | "round2" | "done";

export interface MirrorSchedule {
  round1At: number;
  swapAt: number;
  round2At: number;
  endAt: number;
}

export function buildSchedule(startAt: number): MirrorSchedule {
  const round1At = startAt + INTERMISSION_MS;
  const swapAt = round1At + LEAD_MS;
  const round2At = swapAt + INTERMISSION_MS;
  return { round1At, swapAt, round2At, endAt: round2At + LEAD_MS };
}

export function phaseAt(schedule: MirrorSchedule, now: number): MirrorPhase {
  if (now < schedule.round1At) return "intro";
  if (now < schedule.swapAt) return "round1";
  if (now < schedule.round2At) return "swap";
  if (now < schedule.endAt) return "round2";
  return "done";
}

/** player1 leads round 1; player2 leads round 2. */
export function leaderFor(phase: MirrorPhase): PlayerRole | null {
  if (phase === "round1") return "player1";
  if (phase === "round2") return "player2";
  return null;
}

export function isMirroring(phase: MirrorPhase, role: PlayerRole): boolean {
  const leader = leaderFor(phase);
  return leader !== null && leader !== role;
}

/**
 * Score the mirror against the leader. The leader's angles are flipped
 * left-to-right first — that's what makes it a mirror rather than a copy.
 */
export function mirrorSimilarity(
  leaderAngles: PoseAngles,
  observedAngles: PoseAngles,
): number {
  return comparePoses(mirrorAngles(leaderAngles), observedAngles);
}

export interface MirrorTally {
  samples: number[];
  bestStreak: number;
}

export function summarize(samples: number[]): { average: number; bestStreak: number } {
  const valid = samples.filter((s) => Number.isFinite(s));
  const average =
    valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  let streak = 0;
  let bestStreak = 0;
  for (const s of valid) {
    if (s >= STREAK_THRESHOLD) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }
  return { average, bestStreak };
}

export function mirrorResult(samples: number[]): PlayerResult {
  const { average, bestStreak } = summarize(samples);
  return {
    rawScore: Math.round(average * 10) / 10,
    normalizedScore: Math.round(average * 10) / 10,
    completed: samples.length > 0,
    detail: {
      averageSimilarity: Math.round(average * 10) / 10,
      bestStreakFrames: bestStreak,
      samples: samples.length,
    },
  };
}

/** Playful commentary while mirroring. */
export function mirrorFeedback(score: number): string {
  if (score >= 90) return "Telepathic.";
  if (score >= 75) return "Locked in!";
  if (score >= 55) return "Roughly the same shape.";
  if (score >= 35) return "Loosely inspired by them.";
  return "Completely different person.";
}
