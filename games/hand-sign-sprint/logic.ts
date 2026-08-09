import { mulberry32, pick } from "@/lib/random";
import type { PlayerResult } from "@/types/game";
import type { GestureName } from "@/types/vision";
import type { PlayerRole } from "@/types/player";

/**
 * Hand Sign Sprint: race through a sequence of hand gestures. A target
 * advances as soon as the right gesture is confidently held; wrong
 * gestures cost time. Fastest valid completion wins.
 */

export const TARGET_COUNT = 12;
export const TIME_CAP_MS = 75_000;
/** Time added per wrong gesture, so mashing shapes is a bad strategy. */
export const MISTAKE_PENALTY_MS = 1500;

const VOCABULARY: GestureName[] = [
  "open_palm",
  "fist",
  "peace",
  "thumbs_up",
  "pointing",
];

export function createSequence(seed: number): GestureName[] {
  const rng = mulberry32(seed);
  const sequence: GestureName[] = [];
  for (let i = 0; i < TARGET_COUNT; i++) {
    let next = pick(rng, VOCABULARY);
    // Never repeat back to back — holding one shape would auto-advance.
    if (sequence[i - 1] === next) {
      next = pick(
        rng,
        VOCABULARY.filter((g) => g !== sequence[i - 1]),
      );
    }
    sequence.push(next);
  }
  return sequence;
}

/** Effective time = elapsed plus penalties for wrong gestures. */
export function adjustedTime(elapsedMs: number, mistakes: number): number {
  return elapsedMs + mistakes * MISTAKE_PENALTY_MS;
}

export function handSignResult(
  completed: number,
  elapsedMs: number,
  mistakes: number,
): PlayerResult {
  const finished = completed >= TARGET_COUNT;
  const total = adjustedTime(finished ? elapsedMs : TIME_CAP_MS, mistakes);
  // ~2s per gesture is excellent, ~6s each is slow.
  const perTarget = total / TARGET_COUNT;
  const speedScore = Math.max(0, Math.min(100, 120 - perTarget / 50));
  const normalized = finished
    ? Math.max(45, speedScore)
    : (completed / TARGET_COUNT) * 40;
  return {
    rawScore: completed,
    normalizedScore: Math.round(normalized * 10) / 10,
    completed: finished,
    detail: {
      adjustedMs: Math.round(total),
      elapsedMs: Math.round(elapsedMs),
      mistakes,
      completedTargets: completed,
    },
  };
}

/** Finishing beats not finishing; among finishers, lowest adjusted time. */
export function decideHandSignWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.completed !== p2.completed) return p1.completed ? "player1" : "player2";
  if (p1.completed && p2.completed) {
    const t1 = num(p1.detail?.adjustedMs);
    const t2 = num(p2.detail?.adjustedMs);
    if (t1 !== t2) return t1 < t2 ? "player1" : "player2";
    return null;
  }
  if (p1.rawScore !== p2.rawScore) {
    return p1.rawScore > p2.rawScore ? "player1" : "player2";
  }
  return null;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number.MAX_SAFE_INTEGER;
}
