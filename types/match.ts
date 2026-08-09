import type { PlayerRole } from "./player";
import type { RoundOutcome } from "./game";

export type MatchMode = "quick" | "date_night" | "chaos" | "custom";

export interface MatchConfig {
  mode: MatchMode;
  /** Crowns needed to win the match (best-of-N ⇒ ceil(N/2)). */
  targetWins: number;
  /** Match-level seed; per-round seeds derive from it. */
  seed: number;
  /** Game id per round, length = 2 * targetWins - 1. */
  games: string[];
}

export type MatchPhase =
  | "lobby"
  | "countdown"
  | "in_game"
  | "round_result"
  | "match_result";

export interface MatchState {
  phase: MatchPhase;
  config: MatchConfig | null;
  /** 0-based round index. */
  round: number;
  crowns: Record<PlayerRole, number>;
  outcomes: RoundOutcome[];
  /** Synced epoch ms the current countdown targets. */
  startAt: number | null;
  matchWinner: PlayerRole | null;
}
