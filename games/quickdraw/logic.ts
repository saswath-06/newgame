import { mulberry32, randInt } from "@/lib/random";
import type { PlayerResult } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/**
 * Quickdraw: repeated reaction duels. Both clients derive identical
 * "CLICK!" delays from the round seed; each sub-round's winner is whoever
 * reacts fastest, with false starts (clicking early) losing outright.
 * First to SUBROUNDS_TO_WIN sub-rounds takes the game.
 */

export const SUBROUNDS_TO_WIN = 3;
/** Hard cap so mutual false starts can't loop forever. */
export const MAX_SUBROUNDS = 9;
export const MIN_DELAY_MS = 2000;
export const MAX_DELAY_MS = 6000;
/** Reactions slower than this count as a miss (no click). */
export const REACTION_TIMEOUT_MS = 2500;

export interface QuickdrawConfig {
  /** Delay before "CLICK!" for each potential sub-round, ms. */
  delays: number[];
}

export function createQuickdrawConfig(seed: number): QuickdrawConfig {
  const rng = mulberry32(seed);
  const delays = Array.from({ length: MAX_SUBROUNDS }, () =>
    randInt(rng, MIN_DELAY_MS, MAX_DELAY_MS),
  );
  return { delays };
}

/** One player's reaction in one sub-round. */
export interface Reaction {
  /** ms after "CLICK!"; null = never clicked (timeout). */
  reactionMs: number | null;
  falseStart: boolean;
}

export type SubRoundWinner = PlayerRole | null;

/** Decide a sub-round. False start always loses; both false = wash. */
export function resolveSubRound(p1: Reaction, p2: Reaction): SubRoundWinner {
  if (p1.falseStart && p2.falseStart) return null;
  if (p1.falseStart) return "player2";
  if (p2.falseStart) return "player1";
  if (p1.reactionMs === null && p2.reactionMs === null) return null;
  if (p1.reactionMs === null) return "player2";
  if (p2.reactionMs === null) return "player1";
  if (p1.reactionMs === p2.reactionMs) return null;
  return p1.reactionMs < p2.reactionMs ? "player1" : "player2";
}

export interface QuickdrawStanding {
  wins: Record<PlayerRole, number>;
  /** Set once someone reaches SUBROUNDS_TO_WIN or delays are exhausted. */
  gameWinner: PlayerRole | null;
  done: boolean;
}

/** Fold sub-round reactions into the current standing. */
export function computeStanding(
  p1: Reaction[],
  p2: Reaction[],
): QuickdrawStanding {
  const wins: Record<PlayerRole, number> = { player1: 0, player2: 0 };
  const played = Math.min(p1.length, p2.length);
  for (let i = 0; i < played; i++) {
    const w = resolveSubRound(p1[i], p2[i]);
    if (w) wins[w] += 1;
  }
  let gameWinner: PlayerRole | null = null;
  let done = false;
  if (wins.player1 >= SUBROUNDS_TO_WIN) {
    gameWinner = "player1";
    done = true;
  } else if (wins.player2 >= SUBROUNDS_TO_WIN) {
    gameWinner = "player2";
    done = true;
  } else if (played >= MAX_SUBROUNDS) {
    done = true;
    if (wins.player1 !== wins.player2) {
      gameWinner = wins.player1 > wins.player2 ? "player1" : "player2";
    } else {
      const a1 = averageReaction(p1);
      const a2 = averageReaction(p2);
      if (a1 !== null && a2 !== null && a1 !== a2) {
        gameWinner = a1 < a2 ? "player1" : "player2";
      } else if (a1 !== null && a2 === null) gameWinner = "player1";
      else if (a2 !== null && a1 === null) gameWinner = "player2";
    }
  }
  return { wins, gameWinner, done };
}

/** Average of valid (non-false-start, clicked) reactions, or null. */
export function averageReaction(reactions: Reaction[]): number | null {
  const valid = reactions
    .filter((r) => !r.falseStart && r.reactionMs !== null)
    .map((r) => r.reactionMs as number);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Normalize to 0–100: ~150ms (elite) → 100, ≥1000ms → near 0, with the
 * sub-round wins keeping the score ordered the same way the duel went.
 */
export function quickdrawResult(
  mine: Reaction[],
  theirs: Reaction[],
  myRole: PlayerRole,
): PlayerResult {
  const standing = computeStanding(
    myRole === "player1" ? mine : theirs,
    myRole === "player1" ? theirs : mine,
  );
  const myWins = standing.wins[myRole];
  const avg = averageReaction(mine);
  const speedScore =
    avg === null ? 0 : Math.max(0, Math.min(100, 100 - (avg - 150) / 8.5));
  // Wins dominate (they decided the duel); speed refines within that.
  const normalized = Math.max(
    0,
    Math.min(100, myWins * 25 + speedScore * 0.25),
  );
  return {
    rawScore: myWins,
    normalizedScore: Math.round(normalized * 10) / 10,
    completed: true,
    detail: {
      avgReactionMs: avg === null ? -1 : Math.round(avg),
      falseStarts: mine.filter((r) => r.falseStart).length,
      subRounds: mine.length,
    },
  };
}

/** Round-winner override for the registry: wins first, then avg speed. */
export function decideQuickdrawWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.rawScore !== p2.rawScore)
    return p1.rawScore > p2.rawScore ? "player1" : "player2";
  const a1 = typeof p1.detail?.avgReactionMs === "number" ? p1.detail.avgReactionMs : -1;
  const a2 = typeof p2.detail?.avgReactionMs === "number" ? p2.detail.avgReactionMs : -1;
  if (a1 >= 0 && a2 >= 0 && a1 !== a2) return a1 < a2 ? "player1" : "player2";
  if (a1 >= 0 && a2 < 0) return "player1";
  if (a2 >= 0 && a1 < 0) return "player2";
  return null;
}
