import { describe, expect, it } from "vitest";
import {
  ROUNDS as FREEZE_ROUNDS,
  buildSchedule as buildFreezeSchedule,
  createRounds,
  decideFreezeWinner,
  freezeFeedback,
  freezeResult,
  freezeScore,
  scoreFreezeWindow,
  MAX_MOVE_MS,
  MIN_MOVE_MS,
} from "@/games/freeze/logic";
import {
  MAX_HOLD_MS,
  ROUNDS as BALANCE_ROUNDS,
  balanceResult,
  decideBalanceWinner,
  evaluateForm,
  selectPoses as selectBalancePoses,
  STATE_COPY,
} from "@/games/balance-battle/logic";
import {
  MISTAKE_PENALTY_MS,
  TARGET_COUNT,
  adjustedTime,
  createSequence,
  decideHandSignWinner,
  handSignResult,
} from "@/games/hand-sign-sprint/logic";
import {
  buildSchedule as buildMirrorSchedule,
  isMirroring,
  leaderFor,
  mirrorFeedback,
  mirrorResult,
  mirrorSimilarity,
  phaseAt,
  summarize,
} from "@/games/mirror-me/logic";
import {
  JUDGEMENT_POINTS,
  TIMING_WINDOW_MS,
  allSequences,
  beatTimes,
  decideMoveSyncWinner,
  judgeBeat,
  knownTemplateIds,
  moveSyncResult,
  selectChoreography,
  stepTemplates,
} from "@/games/move-sync/logic";
import { buildBaseline, DEFAULT_BASELINE } from "@/lib/vision/calibration";
import { calculateAngles } from "@/lib/vision/math";
import { makeBody } from "./vision-fixtures";

describe("freeze", () => {
  it("creates deterministic move durations in range", () => {
    const a = createRounds(5);
    expect(a).toEqual(createRounds(5));
    expect(a).toHaveLength(FREEZE_ROUNDS);
    for (const r of a) {
      expect(r.moveMs).toBeGreaterThanOrEqual(MIN_MOVE_MS);
      expect(r.moveMs).toBeLessThanOrEqual(MAX_MOVE_MS);
    }
    expect(createRounds(6)).not.toEqual(a);
  });

  it("schedules calibration before the first round", () => {
    const rounds = createRounds(1);
    const schedule = buildFreezeSchedule(1000, rounds);
    expect(schedule[0].moveAt).toBeGreaterThan(1000);
    for (const slot of schedule) {
      expect(slot.moveAt).toBeLessThan(slot.freezeAt);
      expect(slot.freezeAt).toBeLessThan(slot.revealAt);
      expect(slot.revealAt).toBeLessThan(slot.endAt);
    }
  });

  it("ignores movement inside the noise floor", () => {
    const noisy = buildBaseline(Array.from({ length: 40 }, () => 0.01));
    // Samples at the noise level should cost nothing.
    expect(scoreFreezeWindow(Array(30).fill(0.01), noisy)).toBe(0);
    // Real movement does cost.
    expect(scoreFreezeWindow(Array(30).fill(0.2), noisy)).toBeGreaterThan(0);
  });

  it("penalizes a noisy camera less than a clean one for the same motion", () => {
    const clean = buildBaseline(Array.from({ length: 40 }, () => 0.001));
    const noisy = buildBaseline(Array.from({ length: 40 }, () => 0.02));
    const samples = Array(30).fill(0.05);
    expect(scoreFreezeWindow(samples, noisy)).toBeLessThan(
      scoreFreezeWindow(samples, clean),
    );
  });

  it("is frame-rate independent", () => {
    const b = DEFAULT_BASELINE;
    const short = scoreFreezeWindow(Array(15).fill(0.1), b);
    const long = scoreFreezeWindow(Array(60).fill(0.1), b);
    expect(short).toBeCloseTo(long, 5);
  });

  it("scores stillness at 100 and movement lower", () => {
    expect(freezeScore(0)).toBe(100);
    expect(freezeScore(0.01)).toBeLessThan(100);
    expect(freezeScore(10)).toBe(0);
  });

  it("ranks the stiller player as winner", () => {
    const statue = freezeResult([0, 0.0001, 0]);
    const wiggler = freezeResult([0.02, 0.03, 0.05]);
    expect(statue.normalizedScore).toBeGreaterThan(wiggler.normalizedScore);
    expect(decideFreezeWinner(statue, wiggler)).toBe("player1");
    expect(decideFreezeWinner(wiggler, statue)).toBe("player2");
    // Not finishing loses regardless of how still they were.
    expect(decideFreezeWinner(freezeResult([0]), statue)).toBe("player2");
  });

  it("has feedback for every score band", () => {
    for (const s of [100, 85, 70, 45, 5]) {
      expect(freezeFeedback(s).length).toBeGreaterThan(0);
    }
  });
});

describe("balance battle", () => {
  it("selects deterministic balance poses that are all single-leg", () => {
    const a = selectBalancePoses(9);
    expect(a).toEqual(selectBalancePoses(9));
    expect(a).toHaveLength(BALANCE_ROUNDS);
    for (const p of a) expect(p.singleLeg).toBe(true);
  });

  it("reads form from similarity and sway", () => {
    const b = buildBaseline(Array.from({ length: 40 }, () => 0.004));
    expect(evaluateForm(90, 0.001, b)).toBe("holding");
    expect(evaluateForm(90, 0.03, b)).toBe("wobbling");
    expect(evaluateForm(90, 0.5, b)).toBe("lost");
    // Losing the pose shape ends the hold no matter how steady they are.
    expect(evaluateForm(20, 0, b)).toBe("lost");
  });

  it("scales sway bands with the player's own noise", () => {
    const clean = buildBaseline(Array.from({ length: 40 }, () => 0.002));
    const noisy = buildBaseline(Array.from({ length: 40 }, () => 0.02));
    // Motion that reads as wobbling on a clean camera is fine on a noisy one.
    expect(evaluateForm(90, 0.03, clean)).not.toBe("holding");
    expect(evaluateForm(90, 0.03, noisy)).toBe("holding");
  });

  it("rewards longer holds and caps the score at 100", () => {
    const long = balanceResult([MAX_HOLD_MS, MAX_HOLD_MS]);
    const short = balanceResult([2000, 1500]);
    expect(long.normalizedScore).toBe(100);
    expect(long.normalizedScore).toBeGreaterThan(short.normalizedScore);
    expect(balanceResult([MAX_HOLD_MS * 5, MAX_HOLD_MS * 5]).normalizedScore).toBe(100);
  });

  it("breaks ties on best single hold", () => {
    const even = balanceResult([5000, 5000]);
    const spiky = balanceResult([9000, 1000]);
    expect(even.rawScore).toBe(spiky.rawScore);
    expect(decideBalanceWinner(spiky, even)).toBe("player1");
    expect(decideBalanceWinner(even, even)).toBeNull();
  });

  it("has copy for every form state", () => {
    for (const state of ["waiting", "holding", "wobbling", "lost"] as const) {
      expect(STATE_COPY[state].label.length).toBeGreaterThan(0);
    }
  });
});

describe("hand sign sprint", () => {
  it("creates a deterministic sequence with no back-to-back repeats", () => {
    const a = createSequence(3);
    expect(a).toEqual(createSequence(3));
    expect(a).toHaveLength(TARGET_COUNT);
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
  });

  it("adds a time penalty per mistake", () => {
    expect(adjustedTime(10_000, 0)).toBe(10_000);
    expect(adjustedTime(10_000, 3)).toBe(10_000 + 3 * MISTAKE_PENALTY_MS);
  });

  it("ranks fast clean runs above slow or sloppy ones", () => {
    const fast = handSignResult(TARGET_COUNT, 24_000, 0);
    const slow = handSignResult(TARGET_COUNT, 60_000, 0);
    const sloppy = handSignResult(TARGET_COUNT, 24_000, 6);
    expect(fast.normalizedScore).toBeGreaterThan(slow.normalizedScore);
    expect(fast.normalizedScore).toBeGreaterThan(sloppy.normalizedScore);
    expect(decideHandSignWinner(fast, sloppy)).toBe("player1");
  });

  it("puts any finisher above any non-finisher", () => {
    const finisher = handSignResult(TARGET_COUNT, 70_000, 10);
    const partial = handSignResult(TARGET_COUNT - 1, 75_000, 0);
    expect(finisher.completed).toBe(true);
    expect(partial.completed).toBe(false);
    expect(finisher.normalizedScore).toBeGreaterThan(partial.normalizedScore);
    expect(decideHandSignWinner(partial, finisher)).toBe("player2");
  });

  it("ranks partial runs by targets reached", () => {
    const more = handSignResult(8, 75_000, 0);
    const fewer = handSignResult(3, 75_000, 0);
    expect(decideHandSignWinner(more, fewer)).toBe("player1");
  });
});

describe("mirror me", () => {
  it("alternates leader and mirror across the two rounds", () => {
    const s = buildMirrorSchedule(0);
    expect(phaseAt(s, 0)).toBe("intro");
    expect(phaseAt(s, s.round1At + 100)).toBe("round1");
    expect(phaseAt(s, s.swapAt + 100)).toBe("swap");
    expect(phaseAt(s, s.round2At + 100)).toBe("round2");
    expect(phaseAt(s, s.endAt + 1)).toBe("done");

    expect(leaderFor("round1")).toBe("player1");
    expect(leaderFor("round2")).toBe("player2");
    expect(leaderFor("swap")).toBeNull();

    // Each player mirrors exactly once.
    expect(isMirroring("round1", "player2")).toBe(true);
    expect(isMirroring("round1", "player1")).toBe(false);
    expect(isMirroring("round2", "player1")).toBe(true);
    expect(isMirroring("round2", "player2")).toBe(false);
  });

  it("scores a true mirror far above a literal copy", () => {
    const leader = calculateAngles(makeBody({ leftArmAngle: 180, rightArmAngle: 0 }));
    const mirrored = calculateAngles(makeBody({ leftArmAngle: 0, rightArmAngle: 180 }));
    expect(mirrorSimilarity(leader, mirrored)).toBeGreaterThan(90);
    expect(mirrorSimilarity(leader, leader)).toBeLessThan(
      mirrorSimilarity(leader, mirrored),
    );
  });

  it("summarizes average and the best high-similarity streak", () => {
    const { average, bestStreak } = summarize([80, 85, 90, 20, 75, 95, 99]);
    expect(average).toBeCloseTo((80 + 85 + 90 + 20 + 75 + 95 + 99) / 7, 5);
    expect(bestStreak).toBe(3); // 75, 95, 99
    expect(summarize([]).average).toBe(0);
  });

  it("produces a result ranked by average similarity", () => {
    const good = mirrorResult([88, 91, 84]);
    const poor = mirrorResult([30, 25, 40]);
    expect(good.normalizedScore).toBeGreaterThan(poor.normalizedScore);
    expect(mirrorResult([]).completed).toBe(false);
    expect(mirrorFeedback(95).length).toBeGreaterThan(0);
  });
});

describe("move sync", () => {
  it("only references pose templates that exist", () => {
    const known = new Set(knownTemplateIds());
    for (const seq of allSequences()) {
      expect(seq.steps.length).toBeGreaterThan(0);
      for (const step of seq.steps) expect(known.has(step)).toBe(true);
      expect(stepTemplates(seq)).toHaveLength(seq.steps.length);
    }
  });

  it("selects choreography deterministically", () => {
    expect(selectChoreography(12).name).toBe(selectChoreography(12).name);
  });

  it("spaces beats evenly after a lead-in", () => {
    const beats = beatTimes(1000, 6);
    expect(beats).toHaveLength(6);
    expect(beats[0]).toBeGreaterThan(1000);
    const gaps = beats.slice(1).map((b, i) => b - beats[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 5);
  });

  it("grades on both pose quality and timing", () => {
    expect(judgeBeat(90, 100)).toBe("perfect");
    expect(judgeBeat(90, 400)).toBe("good");
    expect(judgeBeat(65, 600)).toBe("late");
    // Right on the beat but the wrong pose is still a miss.
    expect(judgeBeat(20, 0)).toBe("miss");
    // Right pose far too late is a miss.
    expect(judgeBeat(95, TIMING_WINDOW_MS + 200)).toBe("miss");
    // Early counts the same as late.
    expect(judgeBeat(90, -100)).toBe("perfect");
  });

  it("scores a clean run above a sloppy one and caps at 100", () => {
    const clean = moveSyncResult(Array(6).fill("perfect"), 6);
    const sloppy = moveSyncResult(
      ["perfect", "good", "late", "miss", "miss", "good"],
      6,
    );
    expect(clean.normalizedScore).toBe(100);
    expect(clean.normalizedScore).toBeGreaterThan(sloppy.normalizedScore);
    expect(sloppy.detail?.misses).toBe(2);
    expect(JUDGEMENT_POINTS.miss).toBe(0);
  });

  it("breaks a genuine points tie on the number of PERFECTs", () => {
    // Both score 300/6 = 50, but reached it differently.
    const spiky = moveSyncResult(
      ["perfect", "perfect", "perfect", "miss", "miss", "miss"],
      6,
    );
    const steady = moveSyncResult(
      ["good", "good", "good", "good", "miss", "miss"],
      6,
    );
    expect(spiky.normalizedScore).toBe(steady.normalizedScore);
    expect(spiky.detail?.perfects).toBe(3);
    expect(steady.detail?.perfects).toBe(0);
    expect(decideMoveSyncWinner(spiky, steady)).toBe("player1");
    expect(decideMoveSyncWinner(steady, spiky)).toBe("player2");

    // Identical performances are a genuine draw.
    const same = moveSyncResult(["perfect", "perfect"], 2);
    expect(decideMoveSyncWinner(same, moveSyncResult(["perfect", "perfect"], 2))).toBeNull();
  });
});
