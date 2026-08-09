import { mulberry32 } from "@/lib/random";
import type { PlayerResult } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/**
 * Sequence Showdown: Simon-style memory. One deterministic master
 * sequence per round; each level replays it one step longer. Longest
 * correctly repeated sequence wins; input speed breaks ties.
 */

export const BUTTON_COUNT = 4;
export const MAX_LEVEL = 12;
export const SHOW_MS = 500;
export const SHOW_GAP_MS = 160;
/** Input allowance per element of the current level. */
export const INPUT_MS_PER_STEP = 1600;
export const INPUT_MS_BASE = 1500;

export const BUTTON_STYLES = [
  { label: "🔴", color: "#FF5C5C" },
  { label: "🔵", color: "#5CA8FF" },
  { label: "🟡", color: "#FFD75C" },
  { label: "🟢", color: "#4ADE9C" },
];

export function createSequence(seed: number): number[] {
  const rng = mulberry32(seed);
  const seq: number[] = [];
  for (let i = 0; i < MAX_LEVEL; i++) {
    let next = Math.floor(rng() * BUTTON_COUNT);
    // Avoid immediate triples, which read as display glitches.
    if (i >= 2 && seq[i - 1] === next && seq[i - 2] === next) {
      next = (next + 1 + Math.floor(rng() * (BUTTON_COUNT - 1))) % BUTTON_COUNT;
    }
    seq.push(next);
  }
  return seq;
}

export function inputWindowMs(level: number): number {
  return INPUT_MS_BASE + level * INPUT_MS_PER_STEP;
}

/** level = highest level fully repeated (0 = failed level 1). */
export function sequenceResult(level: number, avgInputMs: number): PlayerResult {
  const speedBonus =
    level > 0 && avgInputMs > 0
      ? Math.max(0, Math.min(10, 10 - avgInputMs / 150))
      : 0;
  const normalized = Math.min(100, (level / MAX_LEVEL) * 90 + speedBonus);
  return {
    rawScore: level,
    normalizedScore: Math.round(normalized * 10) / 10,
    completed: true,
    detail: { level, avgInputMs: Math.round(avgInputMs) },
  };
}

export function decideSequenceWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.rawScore !== p2.rawScore)
    return p1.rawScore > p2.rawScore ? "player1" : "player2";
  const a1 = typeof p1.detail?.avgInputMs === "number" ? p1.detail.avgInputMs : -1;
  const a2 = typeof p2.detail?.avgInputMs === "number" ? p2.detail.avgInputMs : -1;
  if (a1 >= 0 && a2 >= 0 && a1 !== a2) return a1 < a2 ? "player1" : "player2";
  return null;
}
