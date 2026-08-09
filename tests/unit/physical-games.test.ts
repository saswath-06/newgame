import { describe, expect, it } from "vitest";
import {
  POSES_PER_ROUND,
  buildSchedule,
  posePerfectResult,
  selectPoses,
} from "@/games/pose-perfect/logic";
import {
  BaselineCollector,
  DEFAULT_BASELINE,
  buildBaseline,
  motionThreshold,
  swayThresholds,
} from "@/lib/vision/calibration";
import { listGames, selectGames } from "@/games/registry";
import { parseRoomEvent } from "@/types/events";

describe("pose perfect", () => {
  it("picks the same distinct poses from a shared seed", () => {
    const a = selectPoses(31);
    expect(a).toEqual(selectPoses(31));
    expect(a).toHaveLength(POSES_PER_ROUND);
    expect(new Set(a.map((p) => p.id)).size).toBe(POSES_PER_ROUND);
    expect(selectPoses(32).map((p) => p.id)).not.toEqual(a.map((p) => p.id));
  });

  it("builds a strictly increasing, non-overlapping schedule", () => {
    const start = 10_000;
    const schedule = buildSchedule(start);
    expect(schedule).toHaveLength(POSES_PER_ROUND);
    expect(schedule[0].previewAt).toBe(start);
    for (const slot of schedule) {
      expect(slot.previewAt).toBeLessThan(slot.countdownAt);
      expect(slot.countdownAt).toBeLessThan(slot.captureAt);
      expect(slot.captureAt).toBeLessThan(slot.revealAt);
      expect(slot.revealAt).toBeLessThan(slot.endAt);
    }
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].previewAt).toBe(schedule[i - 1].endAt);
    }
  });

  it("averages pose similarity and marks completion", () => {
    const full = posePerfectResult([90, 80, 70, 60, 100]);
    expect(full.normalizedScore).toBe(80);
    expect(full.completed).toBe(true);
    expect(full.detail?.bestPose).toBe(100);

    const partial = posePerfectResult([90, 80]);
    expect(partial.completed).toBe(false);
    expect(partial.detail?.posesScored).toBe(2);

    const none = posePerfectResult([]);
    expect(none.normalizedScore).toBe(0);
    expect(none.completed).toBe(false);
  });

  it("ranks a better poser above a worse one", () => {
    const good = posePerfectResult([88, 91, 85, 90, 87]);
    const poor = posePerfectResult([40, 55, 38, 60, 45]);
    expect(good.normalizedScore).toBeGreaterThan(poor.normalizedScore);
  });
});

describe("self-calibrating thresholds", () => {
  it("falls back to defaults without enough samples", () => {
    expect(buildBaseline([])).toEqual(DEFAULT_BASELINE);
    expect(buildBaseline([0.001, 0.002])).toEqual(DEFAULT_BASELINE);
  });

  it("derives a baseline from steady-hold samples", () => {
    const quiet = Array.from({ length: 40 }, (_, i) => 0.001 + (i % 5) * 0.0002);
    const baseline = buildBaseline(quiet);
    expect(baseline.samples).toBe(40);
    expect(baseline.median).toBeGreaterThan(0);
    expect(baseline.noiseCeiling).toBeGreaterThanOrEqual(baseline.median);
  });

  it("gives a noisy camera a higher motion threshold than a clean one", () => {
    const clean = buildBaseline(Array.from({ length: 40 }, () => 0.002));
    const noisy = buildBaseline(Array.from({ length: 40 }, () => 0.02));
    expect(motionThreshold(noisy)).toBeGreaterThan(motionThreshold(clean));
  });

  it("clamps thresholds so no camera makes the game trivial or impossible", () => {
    const silent = buildBaseline(Array.from({ length: 40 }, () => 0));
    const chaotic = buildBaseline(Array.from({ length: 40 }, () => 5));
    expect(motionThreshold(silent)).toBeGreaterThanOrEqual(0.008);
    expect(motionThreshold(chaotic)).toBeLessThanOrEqual(0.05);
  });

  it("orders sway bands steady < wobbling", () => {
    for (const noise of [0, 0.005, 0.02, 1]) {
      const bands = swayThresholds(buildBaseline(Array.from({ length: 40 }, () => noise)));
      expect(bands.steady).toBeLessThan(bands.wobbling);
      expect(bands.steady).toBeGreaterThan(0);
    }
  });

  it("collects samples and ignores invalid ones", () => {
    const c = new BaselineCollector();
    for (let i = 0; i < 30; i++) c.add(0.003);
    c.add(Number.NaN);
    c.add(-1);
    expect(c.count).toBe(30);
    expect(c.build().samples).toBe(30);
    c.reset();
    expect(c.count).toBe(0);
    expect(c.build()).toEqual(DEFAULT_BASELINE);
  });
});

describe("camera gating", () => {
  it("keeps physical games out of selection without cameras", () => {
    const physicalIds = listGames()
      .filter((g) => g.requiresCamera)
      .map((g) => g.id);
    expect(physicalIds.length).toBeGreaterThan(0);

    for (let seed = 0; seed < 40; seed++) {
      for (const picks of [
        selectGames("quick", seed, false),
        selectGames("date_night", seed, false),
        selectGames("chaos", seed, false),
      ]) {
        for (const id of picks) expect(physicalIds).not.toContain(id);
      }
    }
  });

  it("allows physical games once both players have cameras", () => {
    const physicalIds = new Set(
      listGames().filter((g) => g.requiresCamera).map((g) => g.id),
    );
    // Across many seeds at least one physical game should appear.
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      for (const id of selectGames("chaos", seed, true)) seen.add(id);
    }
    expect([...seen].some((id) => physicalIds.has(id))).toBe(true);
  });

  it("custom mode still respects the camera gate", () => {
    const picks = selectGames("custom", 7, false, ["pose-perfect", "quickdraw"], 2);
    expect(picks).not.toContain("pose-perfect");
  });
});

describe("camera and skip events", () => {
  it("validates camera status and skip negotiation", () => {
    expect(
      parseRoomEvent({ type: "CAMERA_STATUS", playerId: "p1", hasCamera: true }),
    ).toEqual({ type: "CAMERA_STATUS", playerId: "p1", hasCamera: true });
    expect(
      parseRoomEvent({ type: "SKIP_REQUESTED", playerId: "p1", reason: "no camera" }),
    ).not.toBeNull();
    expect(parseRoomEvent({ type: "SKIP_AGREED", playerId: "p1", round: 2 })).not.toBeNull();
  });

  it("rejects malformed camera and skip events", () => {
    expect(parseRoomEvent({ type: "CAMERA_STATUS", playerId: "p1" })).toBeNull();
    expect(parseRoomEvent({ type: "SKIP_REQUESTED", playerId: "p1" })).toBeNull();
    expect(
      parseRoomEvent({ type: "SKIP_AGREED", playerId: "p1", round: "two" }),
    ).toBeNull();
  });
});
