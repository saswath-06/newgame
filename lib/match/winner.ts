import type { GameDefinition, PlayerResult, RoundOutcome } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/** Default round-winner rule: higher normalizedScore, incomplete loses. */
export function decideByNormalizedScore(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.completed !== p2.completed) return p1.completed ? "player1" : "player2";
  if (p1.normalizedScore === p2.normalizedScore) return null;
  return p1.normalizedScore > p2.normalizedScore ? "player1" : "player2";
}

/** Resolve a round once both players' results are in. */
export function resolveRound(
  game: GameDefinition,
  round: number,
  p1: PlayerResult,
  p2: PlayerResult,
): RoundOutcome {
  const decide = game.decideWinner ?? decideByNormalizedScore;
  return {
    round,
    gameId: game.id,
    winnerRole: decide(p1, p2),
    results: { player1: p1, player2: p2 },
  };
}
