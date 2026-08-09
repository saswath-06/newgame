import { mulberry32, pick } from "@/lib/random";

/**
 * Randomized playful result copy. Seeded so both players see the same
 * line for the same round. Teasing, never mean.
 */

const ROUND_WIN_LINES = [
  "Apparently you've been practicing.",
  "The student becomes the master.",
  "Someone woke up sharp today.",
  "Effortless. Almost suspicious.",
  "Add it to the highlight reel.",
  "That one's going in the group chat.",
];

const CLOSE_ROUND_LINES = [
  "That was uncomfortably close.",
  "Photo finish. Someone frame it.",
  "Decided by a whisker.",
  "You two are annoyingly well-matched.",
];

const TIE_LINES = [
  "A perfect tie. Suspiciously romantic.",
  "Great minds click alike.",
  "Nobody wins. Everybody wins?",
];

const MATCH_WIN_LINES = [
  "Champion of the household. For now.",
  "The bragging rights are officially yours.",
  "Dynasty in the making.",
  "Rematch demands incoming in 3… 2…",
];

const MATCH_TIE_LINES = [
  "Dead even. The rematch writes itself.",
  "A draw?! The tension is unbearable.",
];

export function roundResultLine(seed: number, opts: { tie: boolean; close: boolean }): string {
  const rng = mulberry32(seed);
  if (opts.tie) return pick(rng, TIE_LINES);
  if (opts.close) return pick(rng, CLOSE_ROUND_LINES);
  return pick(rng, ROUND_WIN_LINES);
}

export function matchResultLine(seed: number, tie: boolean): string {
  const rng = mulberry32(seed);
  return pick(rng, tie ? MATCH_TIE_LINES : MATCH_WIN_LINES);
}
