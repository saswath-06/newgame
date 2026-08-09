import { describe, expect, it } from "vitest";
import {
  initialMatchState,
  isMatchOver,
  matchReducer,
  maxRounds,
  type MatchAction,
} from "@/lib/match/machine";
import type { MatchConfig, MatchState } from "@/types/match";
import type { RoundOutcome } from "@/types/game";

const config: MatchConfig = {
  mode: "quick",
  targetWins: 2,
  seed: 42,
  games: ["quickdraw", "quickdraw", "quickdraw"],
};

function outcome(round: number, winner: "player1" | "player2" | null): RoundOutcome {
  return {
    round,
    gameId: "quickdraw",
    winnerRole: winner,
    results: {
      player1: { rawScore: 3, normalizedScore: 80, completed: true },
      player2: { rawScore: 1, normalizedScore: 40, completed: true },
    },
  };
}

function run(actions: MatchAction[], from?: MatchState): MatchState {
  return actions.reduce(matchReducer, from ?? initialMatchState());
}

describe("matchReducer", () => {
  it("runs the happy path to a match win", () => {
    let s = run([
      { type: "CONFIGURE", config },
      { type: "COUNTDOWN", startAt: 1000, round: 0 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(0, "player1") },
    ]);
    expect(s.phase).toBe("round_result");
    expect(s.crowns).toEqual({ player1: 1, player2: 0 });
    expect(s.matchWinner).toBeNull();

    s = run(
      [
        { type: "COUNTDOWN", startAt: 2000, round: 1 },
        { type: "GAME_STARTED" },
        { type: "ROUND_COMPLETE", outcome: outcome(1, "player1") },
      ],
      s,
    );
    expect(s.crowns.player1).toBe(2);
    expect(s.matchWinner).toBe("player1");
    expect(isMatchOver(s)).toBe(true);

    s = matchReducer(s, { type: "SHOW_MATCH_RESULT" });
    expect(s.phase).toBe("match_result");
  });

  it("ignores out-of-order and invalid transitions", () => {
    const s0 = initialMatchState();
    expect(matchReducer(s0, { type: "GAME_STARTED" })).toBe(s0);
    expect(matchReducer(s0, { type: "COUNTDOWN", startAt: 1, round: 0 })).toBe(s0);

    const configured = matchReducer(s0, { type: "CONFIGURE", config });
    // wrong round index rejected
    expect(
      matchReducer(configured, { type: "COUNTDOWN", startAt: 1, round: 2 }),
    ).toBe(configured);
    // duplicate ROUND_COMPLETE for a stale round rejected
    const inGame = run([
      { type: "CONFIGURE", config },
      { type: "COUNTDOWN", startAt: 1, round: 0 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(0, "player2") },
    ]);
    expect(
      matchReducer(inGame, { type: "ROUND_COMPLETE", outcome: outcome(0, "player2") }),
    ).toBe(inGame);
  });

  it("does not allow rounds beyond maxRounds and settles a full-length match", () => {
    expect(maxRounds(config)).toBe(3);
    let s = run([
      { type: "CONFIGURE", config },
      { type: "COUNTDOWN", startAt: 1, round: 0 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(0, "player1") },
      { type: "COUNTDOWN", startAt: 2, round: 1 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(1, "player2") },
      { type: "COUNTDOWN", startAt: 3, round: 2 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(2, "player2") },
    ]);
    expect(s.matchWinner).toBe("player2");
    // no further countdown possible
    const stuck = matchReducer(s, { type: "COUNTDOWN", startAt: 4, round: 3 });
    expect(stuck).toBe(s);
    s = matchReducer(s, { type: "SHOW_MATCH_RESULT" });
    expect(s.phase).toBe("match_result");
  });

  it("treats tied crowns after all rounds as a drawn match", () => {
    const s = run([
      { type: "CONFIGURE", config },
      { type: "COUNTDOWN", startAt: 1, round: 0 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(0, "player1") },
      { type: "COUNTDOWN", startAt: 2, round: 1 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(1, "player2") },
      { type: "COUNTDOWN", startAt: 3, round: 2 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(2, null) },
    ]);
    expect(s.matchWinner).toBeNull();
    expect(isMatchOver(s)).toBe(true);
    expect(matchReducer(s, { type: "SHOW_MATCH_RESULT" }).phase).toBe(
      "match_result",
    );
  });

  it("RESET returns to a clean lobby for rematch", () => {
    const s = run([
      { type: "CONFIGURE", config },
      { type: "COUNTDOWN", startAt: 1, round: 0 },
      { type: "GAME_STARTED" },
      { type: "ROUND_COMPLETE", outcome: outcome(0, "player1") },
      { type: "RESET" },
    ]);
    expect(s).toEqual(initialMatchState());
  });
});
