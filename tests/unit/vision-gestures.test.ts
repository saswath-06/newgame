import { describe, expect, it } from "vitest";
import {
  GESTURE_INFO,
  GestureStabilizer,
  getFingerStates,
  recognizeGesture,
} from "@/lib/vision/gestures";
import { makeHand } from "./vision-fixtures";
import type { GestureName } from "@/types/vision";

describe("getFingerStates", () => {
  it("detects extended vs curled fingers", () => {
    const open = getFingerStates(
      makeHand({ index: true, middle: true, ring: true, pinky: true, thumb: true }),
    );
    expect(open).toEqual({
      thumb: true,
      index: true,
      middle: true,
      ring: true,
      pinky: true,
    });

    const closed = getFingerStates(makeHand({}));
    expect(closed.index).toBe(false);
    expect(closed.middle).toBe(false);
    expect(closed.ring).toBe(false);
    expect(closed.pinky).toBe(false);
  });

  it("is scale invariant — a hand near or far reads the same", () => {
    const near = getFingerStates(makeHand({ index: true, scale: 0.4 }));
    const far = getFingerStates(makeHand({ index: true, scale: 0.08 }));
    expect(near).toEqual(far);
  });

  it("is position invariant", () => {
    const left = getFingerStates(makeHand({ index: true, middle: true, cx: 0.15 }));
    const right = getFingerStates(makeHand({ index: true, middle: true, cx: 0.85 }));
    expect(left).toEqual(right);
  });
});

describe("recognizeGesture", () => {
  const cases: [string, Parameters<typeof makeHand>[0], GestureName][] = [
    ["open palm", { index: true, middle: true, ring: true, pinky: true, thumb: true }, "open_palm"],
    ["fist", {}, "fist"],
    ["peace", { index: true, middle: true }, "peace"],
    ["thumbs up", { thumb: true, thumbUp: true }, "thumbs_up"],
    ["pointing", { index: true }, "pointing"],
  ];

  for (const [label, options, expected] of cases) {
    it(`recognizes ${label}`, () => {
      const reading = recognizeGesture(makeHand(options));
      expect(reading.gesture).toBe(expected);
      expect(reading.confidence).toBeGreaterThan(0.6);
    });
  }

  it("recognizes gestures regardless of hand size or position", () => {
    for (const scale of [0.06, 0.2, 0.45]) {
      for (const cx of [0.15, 0.5, 0.85]) {
        const reading = recognizeGesture(makeHand({ index: true, middle: true, scale, cx }));
        expect(reading.gesture).toBe("peace");
      }
    }
  });

  it("distinguishes a fist from a thumbs up", () => {
    expect(recognizeGesture(makeHand({})).gesture).toBe("fist");
    expect(recognizeGesture(makeHand({ thumb: true, thumbUp: true })).gesture).toBe(
      "thumbs_up",
    );
  });

  it("lowers confidence when peace fingers are pressed together", () => {
    const spread = recognizeGesture(makeHand({ index: true, middle: true }));
    const together = recognizeGesture(
      makeHand({ index: true, middle: true, fingersTogether: true }),
    );
    expect(together.confidence).toBeLessThan(spread.confidence);
  });

  it("returns null for missing or malformed input", () => {
    expect(recognizeGesture(null).gesture).toBeNull();
    expect(recognizeGesture([]).gesture).toBeNull();
    expect(recognizeGesture(makeHand({}).slice(0, 10)).gesture).toBeNull();
  });

  it("returns null for ambiguous finger combinations", () => {
    // Ring extended alone isn't in the vocabulary.
    expect(recognizeGesture(makeHand({ ring: true })).gesture).toBeNull();
    expect(recognizeGesture(makeHand({ index: true, ring: true })).gesture).toBeNull();
  });

  it("has display info for every gesture in the vocabulary", () => {
    const names: GestureName[] = ["open_palm", "fist", "peace", "thumbs_up", "pointing"];
    for (const name of names) {
      expect(GESTURE_INFO[name].emoji.length).toBeGreaterThan(0);
      expect(GESTURE_INFO[name].label.length).toBeGreaterThan(0);
    }
  });
});

describe("GestureStabilizer", () => {
  it("requires several consecutive frames before accepting", () => {
    const s = new GestureStabilizer(4, 0.7);
    const reading = { gesture: "peace" as const, confidence: 0.9 };
    expect(s.push(reading)).toBeNull();
    expect(s.push(reading)).toBeNull();
    expect(s.push(reading)).toBeNull();
    expect(s.push(reading)).toBe("peace");
  });

  it("does not fire twice for the same held gesture", () => {
    const s = new GestureStabilizer(2, 0.7);
    const reading = { gesture: "fist" as const, confidence: 0.9 };
    s.push(reading);
    expect(s.push(reading)).toBe("fist");
    expect(s.push(reading)).toBeNull();
    expect(s.push(reading)).toBeNull();
  });

  it("resets its streak when the gesture changes mid-way", () => {
    const s = new GestureStabilizer(3, 0.7);
    s.push({ gesture: "peace", confidence: 0.9 });
    s.push({ gesture: "peace", confidence: 0.9 });
    // A hand passing through another shape restarts the count.
    expect(s.push({ gesture: "fist", confidence: 0.9 })).toBeNull();
    expect(s.push({ gesture: "peace", confidence: 0.9 })).toBeNull();
    expect(s.push({ gesture: "peace", confidence: 0.9 })).toBeNull();
    expect(s.push({ gesture: "peace", confidence: 0.9 })).toBe("peace");
  });

  it("ignores low-confidence readings", () => {
    const s = new GestureStabilizer(2, 0.7);
    expect(s.push({ gesture: "peace", confidence: 0.3 })).toBeNull();
    expect(s.push({ gesture: "peace", confidence: 0.3 })).toBeNull();
    expect(s.push({ gesture: "peace", confidence: 0.3 })).toBeNull();
  });

  it("allows the same gesture again after reset, and reports progress", () => {
    const s = new GestureStabilizer(2, 0.7);
    const reading = { gesture: "thumbs_up" as const, confidence: 0.9 };
    s.push(reading);
    expect(s.push(reading)).toBe("thumbs_up");
    s.reset();
    expect(s.progress).toBe(0);
    s.push(reading);
    expect(s.progress).toBe(0.5);
    expect(s.push(reading)).toBe("thumbs_up");
  });
});
