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
  | { type: "RESET" };

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
      if (state.phase !== "lobby") return state;
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
      if (action.outcome.winnerRole) crowns[action.outcome.winnerRole] += 1;
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
