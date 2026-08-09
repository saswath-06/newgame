import type { MatchConfig, MatchState } from "@/types/match";
import type { RoundOutcome } from "@/types/game";

/**
 * Pure match state machine. No React, no network — both clients run the
 * same reducer over the same event stream and stay in lockstep.
 *
 * lobby → countdown → in_game → round_result → (countdown | match_result)
 * match_result → lobby (rematch resets for a fresh ready-up)
 */

export type MatchAction =
  | { type: "CONFIGURE"; config: MatchConfig }
  | { type: "COUNTDOWN"; startAt: number; round: number }
  | { type: "GAME_STARTED" }
  | { type: "ROUND_COMPLETE"; outcome: RoundOutcome }
  | { type: "SHOW_MATCH_RESULT" }
  | { type: "RESET" }
  /** Adopt a peer snapshot after reconnecting (already validated). */
  | { type: "HYDRATE"; state: MatchState };

export function initialMatchState(): MatchState {
  return {
    phase: "lobby",
    config: null,
    round: 0,
    crowns: { player1: 0, player2: 0 },
    outcomes: [],
    startAt: null,
    matchWinner: null,
  };
}

export function maxRounds(config: MatchConfig): number {
  return 2 * config.targetWins - 1;
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case "CONFIGURE": {
      // match_result → CONFIGURE is the rematch path: fresh match, same room.
      if (state.phase !== "lobby" && state.phase !== "match_result") return state;
      return { ...initialMatchState(), config: action.config };
    }

    case "COUNTDOWN": {
      const canStart =
        state.config !== null &&
        (state.phase === "lobby" || state.phase === "round_result") &&
        state.matchWinner === null &&
        action.round === state.outcomes.length &&
        action.round < maxRounds(state.config);
      if (!canStart) return state;
      return {
        ...state,
        phase: "countdown",
        round: action.round,
        startAt: action.startAt,
      };
    }

    case "GAME_STARTED": {
      if (state.phase !== "countdown") return state;
      return { ...state, phase: "in_game" };
    }

    case "ROUND_COMPLETE": {
      if (state.phase !== "in_game" || !state.config) return state;
      if (action.outcome.round !== state.round) return state;
      const crowns = { ...state.crowns };
      const doublePoints = Boolean(
        state.config.roundModifiers?.[action.outcome.round]?.includes("double_points"),
      );
      if (action.outcome.winnerRole) {
        crowns[action.outcome.winnerRole] += doublePoints ? 2 : 1;
      }
      const outcomes = [...state.outcomes, action.outcome];
      const winner =
        crowns.player1 >= state.config.targetWins
          ? ("player1" as const)
          : crowns.player2 >= state.config.targetWins
            ? ("player2" as const)
            : outcomes.length >= maxRounds(state.config)
              ? crowns.player1 === crowns.player2
                ? null
                : crowns.player1 > crowns.player2
                  ? ("player1" as const)
                  : ("player2" as const)
              : null;
      return {
        ...state,
        phase: "round_result",
        crowns,
        outcomes,
        startAt: null,
        matchWinner: winner,
      };
    }

    case "SHOW_MATCH_RESULT": {
      if (state.phase !== "round_result" || !state.config) return state;
      const over =
        state.matchWinner !== null ||
        state.outcomes.length >= maxRounds(state.config);
      if (!over) return state;
      return { ...state, phase: "match_result" };
    }

    case "RESET":
      return initialMatchState();

    case "HYDRATE":
      return action.state;

    default:
      return state;
  }
}

/** True once the match can no longer continue to another round. */
export function isMatchOver(state: MatchState): boolean {
  if (!state.config) return false;
  return (
    state.matchWinner !== null || state.outcomes.length >= maxRounds(state.config)
  );
}

const PHASES: readonly MatchState["phase"][] = [
  "lobby",
  "countdown",
  "in_game",
  "round_result",
  "match_result",
];

/**
 * Rebuild MatchState from a peer's STATE_SNAPSHOT after a reconnect.
 * Loose shape validation — a malformed snapshot yields null and the
 * rejoiner stays in the lobby rather than crashing.
 */
export function hydrateFromSnapshot(raw: unknown): MatchState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Partial<MatchState>;
  if (!PHASES.includes(s.phase as MatchState["phase"])) return null;
  if (typeof s.round !== "number" || !Array.isArray(s.outcomes)) return null;
  if (
    typeof s.crowns !== "object" ||
    s.crowns === null ||
    typeof s.crowns.player1 !== "number" ||
    typeof s.crowns.player2 !== "number"
  )
    return null;
  return {
    phase: s.phase as MatchState["phase"],
    config: s.config ?? null,
    round: s.round,
    crowns: { player1: s.crowns.player1, player2: s.crowns.player2 },
    outcomes: s.outcomes,
    startAt: typeof s.startAt === "number" ? s.startAt : null,
    matchWinner:
      s.matchWinner === "player1" || s.matchWinner === "player2"
        ? s.matchWinner
        : null,
  };
}
