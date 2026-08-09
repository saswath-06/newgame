import { describe, expect, it } from "vitest";
import {
  analyzeFraming,
  calculateAngle,
  calculateAngles,
  calculateBalanceStability,
  calculateMotion,
  comparePoses,
  mirrorAngles,
  normalizePose,
  smoothLandmarks,
  smoothValue,
} from "@/lib/vision/math";
import { POSE_TEMPLATES, getPoseTemplate, similarityFeedback } from "@/lib/vision/poses";
import { makeBody } from "./vision-fixtures";
import type { Landmark, NormalizedPose } from "@/types/vision";

const pt = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 });

describe("calculateAngle", () => {
  it("measures the interior angle at the vertex", () => {
    // Right angle: (0,1) → (0,0) → (1,0)
    expect(calculateAngle(pt(0, 1), pt(0, 0), pt(1, 0))).toBeCloseTo(90, 5);
    // Straight line
    expect(calculateAngle(pt(-1, 0), pt(0, 0), pt(1, 0))).toBeCloseTo(180, 5);
    // Folded back on itself
    expect(calculateAngle(pt(1, 0), pt(0, 0), pt(1, 0))).toBeCloseTo(0, 5);
  });

  it("is scale and translation invariant", () => {
    const small = calculateAngle(pt(0, 0.1), pt(0, 0), pt(0.1, 0));
    const large = calculateAngle(pt(5, 15), pt(5, 5), pt(15, 5));
    expect(small).toBeCloseTo(large, 5);
  });

  it("returns 0 for degenerate input instead of NaN", () => {
    expect(calculateAngle(pt(0, 0), pt(0, 0), pt(1, 0))).toBe(0);
  });
});

describe("calculateAngles", () => {
  it("reads straight limbs as ~180 degrees", () => {
    const angles = calculateAngles(makeBody({ elbowAngle: 180, kneeAngle: 180 }));
    expect(angles.leftElbow).toBeGreaterThan(170);
    expect(angles.rightElbow).toBeGreaterThan(170);
    expect(angles.leftKnee).toBeGreaterThan(170);
  });

  it("reads a bent elbow as a smaller angle", () => {
    const bent = calculateAngles(makeBody({ elbowAngle: 90 }));
    expect(bent.leftElbow).toBeLessThan(120);
    expect(bent.leftElbow).toBeGreaterThan(60);
  });

  it("separates arms down, sideways, and overhead", () => {
    const down = calculateAngles(makeBody({ armAngle: 0 })).leftShoulder;
    const out = calculateAngles(makeBody({ armAngle: 90 })).leftShoulder;
    const up = calculateAngles(makeBody({ armAngle: 180 })).leftShoulder;
    expect(down).toBeLessThan(25);
    expect(out).toBeGreaterThan(70);
    expect(out).toBeLessThan(110);
    expect(up).toBeGreaterThan(160);
  });

  it("signs body lean by direction", () => {
    expect(calculateAngles(makeBody({ lean: 0 })).bodyLean).toBeCloseTo(0, 1);
    expect(calculateAngles(makeBody({ lean: 25 })).bodyLean).toBeGreaterThan(15);
    expect(calculateAngles(makeBody({ lean: -25 })).bodyLean).toBeLessThan(-15);
  });
});

describe("normalizePose", () => {
  it("makes position and camera distance irrelevant", () => {
    const near = normalizePose(makeBody({ cx: 0.3, cy: 0.4, scale: 0.35 }));
    const far = normalizePose(makeBody({ cx: 0.7, cy: 0.6, scale: 0.12 }));
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    // Same pose, different framing → same normalized geometry.
    for (let i = 11; i <= 28; i++) {
      expect(near!.landmarks[i].x).toBeCloseTo(far!.landmarks[i].x, 4);
      expect(near!.landmarks[i].y).toBeCloseTo(far!.landmarks[i].y, 4);
    }
    expect(near!.torsoLength).toBeGreaterThan(far!.torsoLength);
  });

  it("rejects short or malformed input", () => {
    expect(normalizePose([])).toBeNull();
    expect(normalizePose(Array.from({ length: 10 }, () => pt(0, 0)))).toBeNull();
  });

  it("reports mean visibility as confidence", () => {
    const clear = normalizePose(makeBody({ visibility: 0.95 }));
    const murky = normalizePose(makeBody({ visibility: 0.3 }));
    expect(clear!.confidence).toBeGreaterThan(0.9);
    expect(murky!.confidence).toBeLessThan(0.4);
  });
});

describe("comparePoses", () => {
  it("scores an identical pose 100", () => {
    const angles = calculateAngles(makeBody({ armAngle: 90 }));
    expect(comparePoses(angles, angles)).toBe(100);
  });

  it("scores a matching attempt far above a wrong one", () => {
    const target = calculateAngles(makeBody({ armAngle: 180 })); // arms up
    const good = calculateAngles(makeBody({ armAngle: 175 }));
    const wrong = calculateAngles(makeBody({ armAngle: 0 })); // arms down
    expect(comparePoses(target, good)).toBeGreaterThan(85);
    expect(comparePoses(target, wrong)).toBeLessThan(45);
    expect(comparePoses(target, good)).toBeGreaterThan(comparePoses(target, wrong));
  });

  it("ignores skipped joints", () => {
    const target = calculateAngles(makeBody({ armAngle: 90, kneeAngle: 180 }));
    const legsWrong = calculateAngles(makeBody({ armAngle: 90, kneeAngle: 90 }));
    const withLegs = comparePoses(target, legsWrong);
    const withoutLegs = comparePoses(target, legsWrong, ["leftKnee", "rightKnee"]);
    expect(withoutLegs).toBeGreaterThan(withLegs);
  });

  it("stays within 0-100 for wildly different poses", () => {
    const a = calculateAngles(makeBody({ armAngle: 180, elbowAngle: 180, lean: 40 }));
    const b = calculateAngles(makeBody({ armAngle: 0, elbowAngle: 30, lean: -40 }));
    const score = comparePoses(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("mirrorAngles", () => {
  it("swaps sides and flips lean", () => {
    const asymmetric = calculateAngles(
      makeBody({ leftArmAngle: 180, rightArmAngle: 90, lean: 20 }),
    );
    const mirrored = mirrorAngles(asymmetric);
    expect(mirrored.leftShoulder).toBeCloseTo(asymmetric.rightShoulder, 5);
    expect(mirrored.rightShoulder).toBeCloseTo(asymmetric.leftShoulder, 5);
    expect(mirrored.bodyLean).toBeCloseTo(-asymmetric.bodyLean, 5);
    // Mirroring twice is the identity.
    expect(mirrorAngles(mirrored)).toEqual(asymmetric);
  });

  it("lets a mirrored partner score highly", () => {
    const leader = calculateAngles(makeBody({ leftArmAngle: 180, rightArmAngle: 0 }));
    const mirrorer = calculateAngles(makeBody({ leftArmAngle: 0, rightArmAngle: 180 }));
    expect(comparePoses(mirrorAngles(leader), mirrorer)).toBeGreaterThan(90);
    // Copying literally instead of mirroring scores much worse.
    expect(comparePoses(mirrorAngles(leader), leader)).toBeLessThan(50);
  });
});

describe("calculateMotion", () => {
  it("is ~0 for a still body and grows with movement", () => {
    const still = normalizePose(makeBody({ armAngle: 0 }))!;
    const same = normalizePose(makeBody({ armAngle: 0 }))!;
    const twitch = normalizePose(makeBody({ armAngle: 8 }))!;
    const wave = normalizePose(makeBody({ armAngle: 120 }))!;

    expect(calculateMotion(still, same)).toBeCloseTo(0, 6);
    const small = calculateMotion(still, twitch);
    const big = calculateMotion(still, wave);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small * 3);
  });

  it("ignores the player moving closer to the camera", () => {
    const near = normalizePose(makeBody({ scale: 0.3, cx: 0.5 }))!;
    const far = normalizePose(makeBody({ scale: 0.15, cx: 0.5 }))!;
    // Same pose at a different distance is not "movement".
    expect(calculateMotion(near, far)).toBeCloseTo(0, 4);
  });
});

describe("calculateBalanceStability", () => {
  it("reports near-zero sway for a steady hold", () => {
    const steady = Array.from({ length: 10 }, () => normalizePose(makeBody())!);
    expect(calculateBalanceStability(steady)).toBeCloseTo(0, 5);
  });

  it("grows as the body center wanders", () => {
    const wobbly = Array.from({ length: 10 }, (_, i) =>
      normalizePose(makeBody({ cx: 0.5 + (i % 2 === 0 ? 0.03 : -0.03) }))!,
    );
    expect(calculateBalanceStability(wobbly)).toBeGreaterThan(0.1);
  });

  it("handles too-short histories", () => {
    expect(calculateBalanceStability([])).toBe(0);
    expect(calculateBalanceStability([normalizePose(makeBody())!])).toBe(0);
  });
});

describe("smoothing", () => {
  it("moves landmarks partway toward the new frame", () => {
    const prev = [pt(0, 0)];
    const next = [pt(1, 1)];
    const smoothed = smoothLandmarks(prev, next, 0.5);
    expect(smoothed[0].x).toBeCloseTo(0.5, 5);
    // Mismatched lengths fall back to the new frame.
    expect(smoothLandmarks([pt(0, 0), pt(0, 0)], next)).toEqual(next);
    expect(smoothLandmarks(null, next)).toEqual(next);
  });

  it("damps a jumpy score", () => {
    expect(smoothValue(null, 80)).toBe(80);
    expect(smoothValue(80, 100, 0.5)).toBeCloseTo(90, 5);
    // Repeated smoothing converges on the target.
    let v = 0;
    for (let i = 0; i < 50; i++) v = smoothValue(v, 100, 0.35);
    expect(v).toBeGreaterThan(99);
  });
});

describe("analyzeFraming", () => {
  it("reports no person when landmarks are missing", () => {
    const report = analyzeFraming(null);
    expect(report.ok).toBe(false);
    expect(report.issues).toContain("no_person");
    expect(report.message).toMatch(/step into view/i);
  });

  it("accepts a well-framed full body", () => {
    // Head near the top, ankles near the bottom, centered.
    const report = analyzeFraming(makeBody({ cx: 0.5, cy: 0.45, scale: 0.2 }));
    expect(report.issues).not.toContain("off_center");
    expect(report.issues).not.toContain("lower_body_hidden");
    expect(report.coverage).toBeGreaterThan(0.4);
  });

  it("flags hidden feet, bad centering, and poor visibility", () => {
    expect(analyzeFraming(makeBody({ hideLower: true })).issues).toContain(
      "lower_body_hidden",
    );
    expect(analyzeFraming(makeBody({ cx: 0.05 })).issues).toContain("off_center");
    expect(analyzeFraming(makeBody({ cx: 0.95 })).issues).toContain("off_center");
    expect(analyzeFraming(makeBody({ visibility: 0.2 })).issues).toContain(
      "low_confidence",
    );
  });

  it("flags standing too close", () => {
    const report = analyzeFraming(makeBody({ cx: 0.5, cy: 0.5, scale: 0.42 }));
    expect(report.issues).toContain("too_close");
    expect(report.message).toMatch(/close/i);
  });

  it("always produces a message", () => {
    for (const body of [null, makeBody(), makeBody({ hideLower: true })]) {
      expect(analyzeFraming(body).message.length).toBeGreaterThan(0);
    }
  });
});

describe("pose templates", () => {
  it("are unique and complete", () => {
    const ids = POSE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of POSE_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.hint.length).toBeGreaterThan(0);
      for (const value of Object.values(t.angles)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(getPoseTemplate("star")).not.toBeNull();
    expect(getPoseTemplate("nope")).toBeNull();
  });

  it("distinguishes a matching body from a mismatched one", () => {
    const tPose = getPoseTemplate("t_pose")!;
    const armsOut = calculateAngles(makeBody({ armAngle: 90, elbowAngle: 180 }));
    const armsDown = calculateAngles(makeBody({ armAngle: 0, elbowAngle: 180 }));
    expect(comparePoses(tPose.angles, armsOut)).toBeGreaterThan(80);
    expect(comparePoses(tPose.angles, armsDown)).toBeLessThan(
      comparePoses(tPose.angles, armsOut),
    );
  });

  it("gives friendlier feedback for better scores", () => {
    expect(similarityFeedback(95)).toMatch(/flawless/i);
    expect(similarityFeedback(82)).toMatch(/almost/i);
    expect(similarityFeedback(10)).toContain("😂");
  });
});

describe("normalized pose history", () => {
  it("supports the shapes games pass around", () => {
    const history: NormalizedPose[] = Array.from({ length: 5 }, () =>
      normalizePose(makeBody())!,
    );
    expect(history).toHaveLength(5);
    expect(history[0].angles.leftElbow).toBeGreaterThan(0);
  });
});
