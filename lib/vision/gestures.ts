import { HAND, type GestureName, type GestureReading, type Landmark } from "@/types/vision";
import { distance } from "./math";

/**
 * Heuristic gesture recognition from hand landmark geometry — no ML model
 * beyond MediaPipe's landmarker itself.
 *
 * A finger counts as extended when its tip is farther from the wrist than
 * its middle joint, scaled by hand size so camera distance doesn't matter.
 * The thumb is judged sideways instead, since it folds across the palm.
 */

export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/** Palm width, used as the scale unit for a hand. */
export function handScale(landmarks: Landmark[]): number {
  return Math.max(1e-4, distance(landmarks[HAND.WRIST], landmarks[HAND.MIDDLE_MCP]));
}

function fingerExtended(
  landmarks: Landmark[],
  tip: number,
  pip: number,
  scale: number,
): boolean {
  const wrist = landmarks[HAND.WRIST];
  // Extended fingers put the tip clearly beyond the middle joint.
  return (distance(wrist, landmarks[tip]) - distance(wrist, landmarks[pip])) / scale > 0.35;
}

export function getFingerStates(landmarks: Landmark[]): FingerState {
  const scale = handScale(landmarks);
  const thumbTip = landmarks[HAND.THUMB_TIP];
  const indexMcp = landmarks[HAND.INDEX_MCP];
  const pinkyMcp = landmarks[HAND.PINKY_MCP];
  // The thumb extends across the palm rather than away from the wrist, so
  // measure how far the tip sits from the index knuckle relative to palm width.
  const palmWidth = Math.max(1e-4, distance(indexMcp, pinkyMcp));
  const thumb = distance(thumbTip, indexMcp) / palmWidth > 0.75;

  return {
    thumb,
    index: fingerExtended(landmarks, HAND.INDEX_TIP, HAND.INDEX_PIP, scale),
    middle: fingerExtended(landmarks, HAND.MIDDLE_TIP, HAND.MIDDLE_PIP, scale),
    ring: fingerExtended(landmarks, HAND.RING_TIP, HAND.RING_PIP, scale),
    pinky: fingerExtended(landmarks, HAND.PINKY_TIP, HAND.PINKY_PIP, scale),
  };
}

/** Is the thumb pointing away from the other fingers' direction? */
function thumbIsUp(landmarks: Landmark[]): boolean {
  const thumbTip = landmarks[HAND.THUMB_TIP];
  const indexMcp = landmarks[HAND.INDEX_MCP];
  const scale = handScale(landmarks);
  // Screen y grows downward, so "up" means a smaller y than the knuckles.
  return (indexMcp.y - thumbTip.y) / scale > 0.5;
}

export function recognizeGesture(landmarks: Landmark[] | null): GestureReading {
  if (!landmarks || landmarks.length < 21) return { gesture: null, confidence: 0 };
  const f = getFingerStates(landmarks);
  const extendedCount = [f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;

  if (extendedCount === 4) {
    return { gesture: "open_palm", confidence: f.thumb ? 0.95 : 0.8 };
  }
  if (extendedCount === 0) {
    if (f.thumb && thumbIsUp(landmarks)) {
      return { gesture: "thumbs_up", confidence: 0.9 };
    }
    return { gesture: "fist", confidence: f.thumb ? 0.75 : 0.95 };
  }
  if (f.index && f.middle && !f.ring && !f.pinky) {
    // Peace needs a visible gap between the two fingers.
    const spread =
      distance(landmarks[HAND.INDEX_TIP], landmarks[HAND.MIDDLE_TIP]) /
      handScale(landmarks);
    return { gesture: "peace", confidence: spread > 0.35 ? 0.92 : 0.6 };
  }
  if (f.index && !f.middle && !f.ring && !f.pinky) {
    return { gesture: "pointing", confidence: 0.9 };
  }
  return { gesture: null, confidence: 0 };
}

export const GESTURE_INFO: Record<GestureName, { emoji: string; label: string }> = {
  open_palm: { emoji: "✋", label: "Open palm" },
  fist: { emoji: "👊", label: "Fist" },
  peace: { emoji: "✌️", label: "Peace" },
  thumbs_up: { emoji: "👍", label: "Thumbs up" },
  pointing: { emoji: "☝️", label: "Point" },
};

/**
 * Requires the same gesture across several consecutive confident frames
 * before accepting it, so a hand passing through a shape doesn't count.
 */
export class GestureStabilizer {
  private current: GestureName | null = null;
  private streak = 0;
  private lastAccepted: GestureName | null = null;

  constructor(
    private readonly requiredFrames = 4,
    private readonly minConfidence = 0.7,
  ) {}

  /** Feed a reading; returns a gesture only on the frame it's confirmed. */
  push(reading: GestureReading): GestureName | null {
    const candidate =
      reading.confidence >= this.minConfidence ? reading.gesture : null;
    if (candidate !== this.current) {
      this.current = candidate;
      this.streak = candidate ? 1 : 0;
      return null;
    }
    if (!candidate) return null;
    this.streak += 1;
    if (this.streak === this.requiredFrames && candidate !== this.lastAccepted) {
      this.lastAccepted = candidate;
      return candidate;
    }
    return null;
  }

  /** Allow the same gesture to be accepted again (call between targets). */
  reset(): void {
    this.current = null;
    this.streak = 0;
    this.lastAccepted = null;
  }

  /** Progress toward confirming the current candidate, 0–1. */
  get progress(): number {
    return Math.min(1, this.streak / this.requiredFrames);
  }
}
