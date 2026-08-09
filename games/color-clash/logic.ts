import { mulberry32, pick } from "@/lib/random";
import type { PlayerResult } from "@/types/game";

/**
 * Color Clash: Stroop-effect reaction game. The WORD says one color, the
 * INK is another — players must tap the ink color. Same deterministic
 * prompt series for both players; wrong answers cost heavily so mashing
 * never beats accuracy.
 */

export const COLOR_KEYS = ["red", "blue", "green", "yellow"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const COLOR_HEX: Record<ColorKey, string> = {
  red: "#FF5C5C",
  blue: "#5CA8FF",
  green: "#4ADE9C",
  yellow: "#FFD75C",
};

export const PROMPT_COUNT = 20;
export const PROMPT_TIMEOUT_MS = 2500;
/** Pause between prompts so answers never bleed into each other. */
export const INTERSTITIAL_MS = 350;

export interface ColorPrompt {
  /** The word displayed. */
  word: ColorKey;
  /** The color it is displayed in — the correct answer. */
  ink: ColorKey;
}

export function createPrompts(seed: number): ColorPrompt[] {
  const rng = mulberry32(seed);
  return Array.from({ length: PROMPT_COUNT }, () => {
    const word = pick(rng, COLOR_KEYS);
    // ~80% incongruent (the fun part), ~20% congruent (keeps players honest).
    const ink =
      rng() < 0.8
        ? pick(rng, COLOR_KEYS.filter((c) => c !== word))
        : word;
    return { word, ink };
  });
}

export interface ColorAnswer {
  /** null = timed out. */
  choice: ColorKey | null;
  reactionMs: number;
}

export function isCorrect(prompt: ColorPrompt, answer: ColorAnswer): boolean {
  return answer.choice === prompt.ink;
}

/**
 * Per prompt: fast correct ≈ 100, slow correct ≥ 20, wrong/timeout −50.
 * Normalized = clamp(mean, 0..100); random clicking lands near zero.
 */
export function colorClashResult(
  prompts: ColorPrompt[],
  answers: ColorAnswer[],
): PlayerResult {
  let points = 0;
  let correct = 0;
  let reactionTotal = 0;
  answers.forEach((a, i) => {
    if (i < prompts.length && isCorrect(prompts[i], a)) {
      correct += 1;
      reactionTotal += a.reactionMs;
      points += Math.max(20, Math.min(100, 110 - a.reactionMs / 20));
    } else {
      points -= 50;
    }
  });
  const normalized = Math.max(0, Math.min(100, points / prompts.length));
  return {
    rawScore: correct,
    normalizedScore: Math.round(normalized * 10) / 10,
    completed: answers.length >= prompts.length,
    detail: {
      correct,
      avgReactionMs: correct > 0 ? Math.round(reactionTotal / correct) : -1,
      answered: answers.length,
    },
  };
}
