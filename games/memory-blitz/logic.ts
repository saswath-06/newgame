import { mulberry32, shuffle } from "@/lib/random";
import type { PlayerResult } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/**
 * Memory Blitz: both players race to clear the SAME shuffled pair board,
 * generated from the shared seed. First to clear wins; mistakes tiebreak.
 */

export const PAIR_COUNT = 8;
export const BOARD_SIZE = PAIR_COUNT * 2;
export const TIME_CAP_MS = 90_000;
/** How long a failed pair stays face-up before flipping back. */
export const MISMATCH_REVEAL_MS = 700;

const EMOJI_POOL = [
  "🍓", "🌙", "🔥", "🌊", "⭐", "🍩", "🎧", "🌵",
  "🦊", "🍒", "⚡", "🎲", "🌸", "🍕", "🚀", "🎯",
];

export interface MemoryCard {
  /** Position on the board (stable identity). */
  id: number;
  emoji: string;
}

export function createBoard(seed: number): MemoryCard[] {
  const rng = mulberry32(seed);
  const emojis = shuffle(rng, EMOJI_POOL).slice(0, PAIR_COUNT);
  const cards = shuffle(rng, [...emojis, ...emojis]);
  return cards.map((emoji, id) => ({ id, emoji }));
}

export function memoryResult(
  matched: number,
  timeMs: number,
  mistakes: number,
): PlayerResult {
  const completed = matched >= PAIR_COUNT;
  // Any completion outranks any non-completion: incomplete caps at 40,
  // complete floors at 45 no matter how slow/sloppy the clear was.
  const normalized = completed
    ? Math.max(45, Math.min(100, 100 - (timeMs / 1000 - 15) * 1.8 - mistakes * 2.5))
    : (matched / PAIR_COUNT) * 40;
  return {
    rawScore: matched,
    normalizedScore: Math.round(normalized * 10) / 10,
    completed,
    detail: { timeMs: Math.round(timeMs), mistakes, matched },
  };
}

/** First to clear wins; among finishers lower time, then fewer mistakes. */
export function decideMemoryWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.completed !== p2.completed) return p1.completed ? "player1" : "player2";
  const t1 = num(p1.detail?.timeMs);
  const t2 = num(p2.detail?.timeMs);
  const m1 = num(p1.detail?.mistakes);
  const m2 = num(p2.detail?.mistakes);
  if (p1.completed && p2.completed) {
    if (t1 !== t2) return t1 < t2 ? "player1" : "player2";
    if (m1 !== m2) return m1 < m2 ? "player1" : "player2";
    return null;
  }
  // Neither finished: more pairs, then fewer mistakes.
  if (p1.rawScore !== p2.rawScore)
    return p1.rawScore > p2.rawScore ? "player1" : "player2";
  if (m1 !== m2) return m1 < m2 ? "player1" : "player2";
  return null;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number.MAX_SAFE_INTEGER;
}
