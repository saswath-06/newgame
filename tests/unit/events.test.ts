import { describe, expect, it } from "vitest";
import { parseRoomEvent } from "@/types/events";
import { decideByNormalizedScore, resolveRound } from "@/lib/match/winner";
import type { GameDefinition } from "@/types/game";

describe("parseRoomEvent", () => {
  it("accepts well-formed events", () => {
    expect(
      parseRoomEvent({ type: "PLAYER_READY", playerId: "p1", ready: true }),
    ).toEqual({ type: "PLAYER_READY", playerId: "p1", ready: true });

    expect(
      parseRoomEvent({
        type: "GAME_RESULT",
        playerId: "p1",
        round: 0,
        result: { rawScore: 3, normalizedScore: 82.5, completed: true },
      }),
    ).not.toBeNull();

    expect(
      parseRoomEvent({
        type: "MATCH_CONFIGURED",
        config: { mode: "quick", targetWins: 2, seed: 1, games: ["quickdraw"] },
      }),
    ).not.toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(parseRoomEvent(null)).toBeNull();
    expect(parseRoomEvent("PLAYER_READY")).toBeNull();
    expect(parseRoomEvent({ type: "UNKNOWN_EVENT" })).toBeNull();
    expect(parseRoomEvent({ type: "PLAYER_READY", playerId: 5, ready: true })).toBeNull();
    expect(
      parseRoomEvent({
        type: "GAME_RESULT",
        playerId: "p1",
        round: 0,
        result: { rawScore: 3, normalizedScore: 150, completed: true },
      }),
    ).toBeNull();
    expect(
      parseRoomEvent({
        type: "MATCH_CONFIGURED",
        config: { mode: "quick", targetWins: 0, seed: 1, games: [] },
      }),
    ).toBeNull();
  });
});

describe("winner resolution", () => {
  it("defaults to normalized score with incompletion losing", () => {
    const done = { rawScore: 1, normalizedScore: 40, completed: true };
    const better = { rawScore: 2, normalizedScore: 70, completed: true };
    const bailed = { rawScore: 5, normalizedScore: 99, completed: false };
    expect(decideByNormalizedScore(better, done)).toBe("player1");
    expect(decideByNormalizedScore(done, better)).toBe("player2");
    expect(decideByNormalizedScore(done, done)).toBeNull();
    expect(decideByNormalizedScore(bailed, done)).toBe("player2");
  });

  it("resolveRound honors a game's custom decideWinner", () => {
    const game = {
      id: "test",
      decideWinner: () => "player2",
    } as unknown as GameDefinition;
    const r = { rawScore: 0, normalizedScore: 100, completed: true };
    const outcome = resolveRound(game, 3, r, r);
    expect(outcome.winnerRole).toBe("player2");
    expect(outcome.round).toBe(3);
    expect(outcome.gameId).toBe("test");
  });
});
