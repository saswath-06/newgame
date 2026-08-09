import { describe, expect, it } from "vitest";
import { listGames, selectGames, targetWinsForMode } from "@/games/registry";
import { MODIFIERS, assignModifiers, getModifier } from "@/games/modifiers";
import { initialMatchState, matchReducer } from "@/lib/match/machine";
import { parseRoomEvent } from "@/types/events";
import type { MatchConfig } from "@/types/match";
import type { RoundOutcome } from "@/types/game";

describe("mode game selection", () => {
  it("produces the right round counts per mode", () => {
    expect(selectGames("quick", 1, false)).toHaveLength(3);
    expect(selectGames("date_night", 1, false)).toHaveLength(7);
    expect(selectGames("chaos", 1, false)).toHaveLength(9);
    expect(targetWinsForMode("date_night")).toBe(4);
    expect(targetWinsForMode("chaos")).toBe(5);
  });

  it("is deterministic per seed", () => {
    expect(selectGames("chaos", 77, false)).toEqual(selectGames("chaos", 77, false));
  });

  it("custom mode respects the chosen pool and length", () => {
    const picks = selectGames("custom", 5, false, ["maze-race", "heart-pong"], 3);
    expect(picks).toHaveLength(5); // best of 5
    for (const id of picks) expect(["maze-race", "heart-pong"]).toContain(id);
  });

  it("custom mode falls back to the full pool when selection is invalid", () => {
    const picks = selectGames("custom", 5, false, ["nonexistent-game"], 2);
    expect(picks).toHaveLength(3);
    const valid = new Set(listGames().map((g) => g.id));
    for (const id of picks) expect(valid.has(id)).toBe(true);
  });
});

describe("chaos modifiers", () => {
  it("only chaos rounds get modifiers, deterministically", () => {
    const games = selectGames("chaos", 42, false);
    const mods = assignModifiers("chaos", 42, games);
    expect(mods).toEqual(assignModifiers("chaos", 42, games));
    expect(mods).toHaveLength(games.length);
    expect(assignModifiers("quick", 42, games).every((m) => m.length === 0)).toBe(true);
  });

  it("assigned modifiers are real and applicable to their game", () => {
    // Sample many seeds to cover assignment paths.
    for (let seed = 0; seed < 50; seed++) {
      const games = selectGames("chaos", seed, false);
      const mods = assignModifiers("chaos", seed, games);
      mods.forEach((roundMods, i) => {
        expect(roundMods.length).toBeLessThanOrEqual(1);
        for (const id of roundMods) {
          const def = getModifier(id);
          expect(def).not.toBeNull();
          if (def!.appliesTo.length > 0) {
            expect(def!.appliesTo).toContain(games[i]);
          }
        }
      });
    }
    expect(MODIFIERS.length).toBeGreaterThanOrEqual(4);
  });
});

describe("double points in the match machine", () => {
  it("awards two crowns for a double_points round", () => {
    const config: MatchConfig = {
      mode: "chaos",
      targetWins: 5,
      seed: 1,
      games: ["quickdraw", "quickdraw", "quickdraw", "quickdraw", "quickdraw",
        "quickdraw", "quickdraw", "quickdraw", "quickdraw"],
      roundModifiers: [["double_points"], [], [], [], [], [], [], [], []],
    };
    const outcome: RoundOutcome = {
      round: 0,
      gameId: "quickdraw",
      winnerRole: "player1",
      results: {
        player1: { rawScore: 3, normalizedScore: 80, completed: true },
        player2: { rawScore: 1, normalizedScore: 40, completed: true },
      },
    };
    const s = [
      { type: "CONFIGURE", config } as const,
      { type: "COUNTDOWN", startAt: 1, round: 0 } as const,
      { type: "GAME_STARTED" } as const,
      { type: "ROUND_COMPLETE", outcome } as const,
    ].reduce(matchReducer, initialMatchState());
    expect(s.crowns.player1).toBe(2);
    expect(s.crowns.player2).toBe(0);
  });
});

describe("MODE_SELECTED event", () => {
  it("round-trips valid selections", () => {
    expect(parseRoomEvent({ type: "MODE_SELECTED", mode: "chaos" })).toEqual({
      type: "MODE_SELECTED",
      mode: "chaos",
      custom: undefined,
    });
    expect(
      parseRoomEvent({
        type: "MODE_SELECTED",
        mode: "custom",
        custom: { targetWins: 3, gameIds: ["quickdraw"] },
      }),
    ).not.toBeNull();
  });

  it("rejects bad modes and bad custom settings", () => {
    expect(parseRoomEvent({ type: "MODE_SELECTED", mode: "ranked" })).toBeNull();
    expect(
      parseRoomEvent({
        type: "MODE_SELECTED",
        mode: "custom",
        custom: { targetWins: 99, gameIds: [] },
      }),
    ).toBeNull();
  });
});
