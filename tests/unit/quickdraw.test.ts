import { describe, expect, it } from "vitest";
import {
  MAX_DELAY_MS,
  MAX_SUBROUNDS,
  MIN_DELAY_MS,
  SUBROUNDS_TO_WIN,
  averageReaction,
  computeStanding,
  createQuickdrawConfig,
  decideQuickdrawWinner,
  quickdrawResult,
  resolveSubRound,
  type Reaction,
} from "@/games/quickdraw/logic";

const click = (ms: number): Reaction => ({ reactionMs: ms, falseStart: false });
const miss = (): Reaction => ({ reactionMs: null, falseStart: false });
const early = (): Reaction => ({ reactionMs: null, falseStart: true });

describe("createQuickdrawConfig", () => {
  it("is deterministic per seed with delays in range", () => {
    const a = createQuickdrawConfig(123);
    const b = createQuickdrawConfig(123);
    expect(a).toEqual(b);
    expect(a.delays).toHaveLength(MAX_SUBROUNDS);
    for (const d of a.delays) {
      expect(d).toBeGreaterThanOrEqual(MIN_DELAY_MS);
      expect(d).toBeLessThanOrEqual(MAX_DELAY_MS);
    }
    expect(createQuickdrawConfig(124).delays).not.toEqual(a.delays);
  });
});

describe("resolveSubRound", () => {
  it("fastest valid click wins", () => {
    expect(resolveSubRound(click(200), click(300))).toBe("player1");
    expect(resolveSubRound(click(500), click(210))).toBe("player2");
    expect(resolveSubRound(click(250), click(250))).toBeNull();
  });

  it("false starts lose; double false start is a wash", () => {
    expect(resolveSubRound(early(), click(900))).toBe("player2");
    expect(resolveSubRound(click(900), early())).toBe("player1");
    expect(resolveSubRound(early(), early())).toBeNull();
  });

  it("missing entirely loses to any click", () => {
    expect(resolveSubRound(miss(), click(999))).toBe("player2");
    expect(resolveSubRound(miss(), miss())).toBeNull();
  });
});

describe("computeStanding", () => {
  it("declares winner at SUBROUNDS_TO_WIN", () => {
    const p1 = [click(200), click(200), click(200)];
    const p2 = [click(300), click(300), click(300)];
    const s = computeStanding(p1, p2);
    expect(s.wins.player1).toBe(SUBROUNDS_TO_WIN);
    expect(s.gameWinner).toBe("player1");
    expect(s.done).toBe(true);
  });

  it("keeps playing after washes", () => {
    const s = computeStanding([early(), click(200)], [early(), click(300)]);
    expect(s.done).toBe(false);
    expect(s.wins).toEqual({ player1: 1, player2: 0 });
  });

  it("breaks a full-length tie by average reaction", () => {
    // Two wins each plus washes until MAX_SUBROUNDS: neither reaches 3 wins,
    // so the exhaustion tiebreak (lower average reaction) decides.
    const p1: Reaction[] = [click(200), click(400), click(210), click(400)];
    const p2: Reaction[] = [click(400), click(199), click(400), click(205)];
    while (p1.length < MAX_SUBROUNDS) {
      p1.push(early());
      p2.push(early());
    }
    const s = computeStanding(p1, p2);
    expect(s.done).toBe(true);
    expect(s.wins.player1).toBe(2);
    expect(s.wins.player2).toBe(2);
    // p1 avg = 302.5, p2 avg = 301 → player2 takes the tiebreak
    expect(s.gameWinner).toBe("player2");
  });
});

describe("scoring", () => {
  it("averages only valid clicks", () => {
    expect(averageReaction([click(200), early(), miss(), click(400)])).toBe(300);
    expect(averageReaction([early(), miss()])).toBeNull();
  });

  it("produces normalized 0-100 results and orders winner above loser", () => {
    const mine = [click(180), click(190), click(200)];
    const theirs = [click(400), click(420), click(380)];
    const winner = quickdrawResult(mine, theirs, "player1");
    const loser = quickdrawResult(theirs, mine, "player2");
    expect(winner.normalizedScore).toBeGreaterThan(loser.normalizedScore);
    expect(winner.normalizedScore).toBeLessThanOrEqual(100);
    expect(loser.normalizedScore).toBeGreaterThanOrEqual(0);
    expect(winner.rawScore).toBe(3);
    expect(decideQuickdrawWinner(winner, loser)).toBe("player1");
  });

  it("tiebreaks equal wins on average reaction", () => {
    const a = {
      rawScore: 2,
      normalizedScore: 60,
      completed: true,
      detail: { avgReactionMs: 250 },
    };
    const b = {
      rawScore: 2,
      normalizedScore: 60,
      completed: true,
      detail: { avgReactionMs: 300 },
    };
    expect(decideQuickdrawWinner(a, b)).toBe("player1");
    expect(decideQuickdrawWinner(b, a)).toBe("player2");
  });
});
