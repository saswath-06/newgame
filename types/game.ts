import type { ComponentType } from "react";
import type { PlayerRole } from "./player";

export type GameCategory = "arcade" | "physical";

/** Final result one player produced for one round of a game. */
export interface PlayerResult {
  rawScore: number;
  /** 0–100, comparable across players within the same game. */
  normalizedScore: number;
  completed: boolean;
  /** Game-specific extras (avg reaction ms, mistakes, …) for stats/tiebreaks. */
  detail?: Record<string, number | string | boolean>;
}

/** Resolved outcome of a round once both players' results are known. */
export interface RoundOutcome {
  round: number;
  gameId: string;
  winnerRole: PlayerRole | null;
  results: Record<PlayerRole, PlayerResult>;
}

/** Props every game component receives from the match controller. */
export interface GameProps {
  /** Deterministic seed shared by both clients for this round. */
  seed: number;
  round: number;
  role: PlayerRole;
  playerName: string;
  partnerName: string;
  /** Offset-corrected epoch ms at which gameplay begins. */
  startAt: number;
  /** Synced clock (host-aligned epoch ms). */
  now: () => number;
  /** Broadcast a low-frequency in-game event to the partner. */
  sendGameEvent: (payload: Record<string, unknown>) => void;
  /** Subscribe to partner game events. Returns unsubscribe. */
  onGameEvent: (
    handler: (payload: Record<string, unknown>) => void,
  ) => () => void;
  /** Report this player's final result for the round. Call exactly once. */
  onFinish: (result: PlayerResult) => void;
  /** Partner's live result, if it arrived before ours (for spectating UI). */
  partnerResult: PlayerResult | null;
}

export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  /** Emoji used in lists and headers. */
  icon: string;
  category: GameCategory;
  requiresCamera: boolean;
  estimatedDurationSec: number;
  component: ComponentType<GameProps>;
  /**
   * Decide the round winner from both results. Defaults to comparing
   * normalizedScore; games override for custom tiebreaks.
   */
  decideWinner?: (
    p1: PlayerResult,
    p2: PlayerResult,
  ) => PlayerRole | null;
}
