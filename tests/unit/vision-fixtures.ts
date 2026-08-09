import { POSE, POSE_LANDMARK_COUNT, HAND, HAND_LANDMARK_COUNT, type Landmark } from "@/types/vision";

/**
 * Synthetic landmark builders. Vision algorithms are pure functions over
 * landmark arrays, so tests feed them hand-built bodies and hands instead
 * of running MediaPipe.
 *
 * Coordinates are normalized (0–1) with y growing downward, matching
 * MediaPipe's output.
 */

export interface BodyOptions {
  /** Center of the torso in frame. */
  cx?: number;
  cy?: number;
  /** Torso length; larger = closer to the camera. */
  scale?: number;
  /** Arm direction in degrees: 0 = down at sides, 90 = out sideways, 180 = overhead. */
  armAngle?: number;
  leftArmAngle?: number;
  rightArmAngle?: number;
  /** Elbow bend, 180 = straight. */
  elbowAngle?: number;
  /** Knee bend, 180 = straight. */
  kneeAngle?: number;
  /** Torso tilt in degrees; positive leans right on screen. */
  lean?: number;
  /** Raise the right knee (single-leg poses). */
  rightKneeUp?: boolean;
  visibility?: number;
  /** Hide ankles/feet, as when a player stands too close. */
  hideLower?: boolean;
}

/**
 * Build a 33-point pose. Limbs are placed by polar geometry from the
 * shoulder/hip joints so the resulting joint angles are predictable.
 */
export function makeBody(options: BodyOptions = {}): Landmark[] {
  const {
    cx = 0.5,
    cy = 0.5,
    scale = 0.2,
    armAngle = 0,
    leftArmAngle = armAngle,
    rightArmAngle = armAngle,
    elbowAngle = 180,
    kneeAngle = 180,
    lean = 0,
    rightKneeUp = false,
    visibility = 0.95,
    hideLower = false,
  } = options;

  const pts: Landmark[] = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
    x: cx,
    y: cy,
    z: 0,
    visibility,
  }));
  const set = (i: number, x: number, y: number, vis = visibility) => {
    pts[i] = { x, y, z: 0, visibility: vis };
  };

  const leanRad = (lean * Math.PI) / 180;
  const shoulderY = cy - (scale / 2) * Math.cos(leanRad);
  const shoulderX = cx + (scale / 2) * Math.sin(leanRad);
  const hipY = cy + (scale / 2) * Math.cos(leanRad);
  const hipX = cx - (scale / 2) * Math.sin(leanRad);
  const halfWidth = scale * 0.35;
  const upperArm = scale * 0.55;
  const foreArm = scale * 0.5;
  const thigh = scale * 0.7;
  const shin = scale * 0.65;

  // Shoulders and hips (left is screen-right for a mirrored view, but the
  // math only cares about consistency).
  set(POSE.LEFT_SHOULDER, shoulderX + halfWidth, shoulderY);
  set(POSE.RIGHT_SHOULDER, shoulderX - halfWidth, shoulderY);
  set(POSE.LEFT_HIP, hipX + halfWidth * 0.8, hipY);
  set(POSE.RIGHT_HIP, hipX - halfWidth * 0.8, hipY);
  set(POSE.NOSE, shoulderX, shoulderY - scale * 0.4);
  set(POSE.LEFT_EYE, shoulderX + scale * 0.06, shoulderY - scale * 0.45);
  set(POSE.RIGHT_EYE, shoulderX - scale * 0.06, shoulderY - scale * 0.45);

  // Arms: angle measured from "hanging down along the torso".
  const placeArm = (
    shoulderIdx: number,
    elbowIdx: number,
    wristIdx: number,
    sign: 1 | -1,
    angleDeg: number,
  ) => {
    const s = pts[shoulderIdx];
    // 0° points down (+y), 90° out to the side, 180° straight up.
    const rad = ((angleDeg + lean) * Math.PI) / 180;
    const ex = s.x + sign * upperArm * Math.sin(rad);
    const ey = s.y + upperArm * Math.cos(rad);
    set(elbowIdx, ex, ey);
    // Bend the forearm inward by (180 - elbowAngle).
    const bend = ((angleDeg + lean + (180 - elbowAngle)) * Math.PI) / 180;
    set(wristIdx, ex + sign * foreArm * Math.sin(bend), ey + foreArm * Math.cos(bend));
  };
  placeArm(POSE.LEFT_SHOULDER, POSE.LEFT_ELBOW, POSE.LEFT_WRIST, 1, leftArmAngle);
  placeArm(POSE.RIGHT_SHOULDER, POSE.RIGHT_ELBOW, POSE.RIGHT_WRIST, -1, rightArmAngle);

  // Legs hang down; knee bend folds the shin backward.
  const placeLeg = (
    hipIdx: number,
    kneeIdx: number,
    ankleIdx: number,
    footIdx: number,
    sign: 1 | -1,
    raised: boolean,
  ) => {
    const h = pts[hipIdx];
    const vis = hideLower ? 0.1 : visibility;
    if (raised) {
      // Thigh forward/up, shin tucked under: hip ≈ 95°, knee ≈ 85°.
      const kx = h.x + sign * thigh * 0.55;
      const ky = h.y + thigh * 0.15;
      set(kneeIdx, kx, ky, vis);
      set(ankleIdx, kx - sign * shin * 0.1, ky + shin * 0.75, vis);
      set(footIdx, kx - sign * shin * 0.1, ky + shin * 0.85, vis);
      return;
    }
    const bendRad = ((180 - kneeAngle) * Math.PI) / 180;
    const kx = h.x + sign * thigh * Math.sin(bendRad / 2);
    const ky = h.y + thigh * Math.cos(bendRad / 2);
    set(kneeIdx, kx, ky, vis);
    set(ankleIdx, kx - sign * shin * Math.sin(bendRad / 2), ky + shin * Math.cos(bendRad / 2), vis);
    set(footIdx, kx - sign * shin * Math.sin(bendRad / 2), ky + shin * Math.cos(bendRad / 2) + 0.01, vis);
  };
  placeLeg(POSE.LEFT_HIP, POSE.LEFT_KNEE, POSE.LEFT_ANKLE, POSE.LEFT_FOOT, 1, false);
  placeLeg(POSE.RIGHT_HIP, POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE, POSE.RIGHT_FOOT, -1, rightKneeUp);

  return pts;
}

export interface HandOptions {
  /** Which fingers are extended. */
  index?: boolean;
  middle?: boolean;
  ring?: boolean;
  pinky?: boolean;
  thumb?: boolean;
  /** Point the thumb upward (for thumbs-up). */
  thumbUp?: boolean;
  cx?: number;
  cy?: number;
  scale?: number;
  /** Bring the two extended fingers together (defeats the peace check). */
  fingersTogether?: boolean;
}

/** Build a 21-point hand with the requested fingers extended. */
export function makeHand(options: HandOptions = {}): Landmark[] {
  const {
    index = false,
    middle = false,
    ring = false,
    pinky = false,
    thumb = false,
    thumbUp = false,
    cx = 0.5,
    cy = 0.5,
    scale = 0.2,
    fingersTogether = false,
  } = options;

  const pts: Landmark[] = Array.from({ length: HAND_LANDMARK_COUNT }, () => ({
    x: cx,
    y: cy,
    z: 0,
  }));
  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y, z: 0 };
  };

  // Wrist at the bottom, knuckles a palm-length above it.
  set(HAND.WRIST, cx, cy + scale);
  const knuckleY = cy;
  const spread = scale * 0.28;
  const fingers: [number, number, number, number, number, boolean][] = [
    [HAND.INDEX_MCP, HAND.INDEX_PIP, HAND.INDEX_DIP, HAND.INDEX_TIP, -1.5, index],
    [HAND.MIDDLE_MCP, HAND.MIDDLE_PIP, HAND.MIDDLE_DIP, HAND.MIDDLE_TIP, -0.5, middle],
    [HAND.RING_MCP, HAND.RING_PIP, HAND.RING_DIP, HAND.RING_TIP, 0.5, ring],
    [HAND.PINKY_MCP, HAND.PINKY_PIP, HAND.PINKY_DIP, HAND.PINKY_TIP, 1.5, pinky],
  ];

  for (const [mcp, pip, dip, tip, slot, extended] of fingers) {
    // Extended fingers splay outward from the palm, as real ones do — the
    // tips separate noticeably more than the knuckles.
    const splay = fingersTogether ? 1 : 1.8;
    const x = cx + slot * spread * splay;
    set(mcp, cx + slot * spread, knuckleY);
    if (extended) {
      set(pip, cx + slot * spread * (1 + (splay - 1) * 0.4), knuckleY - scale * 0.35);
      set(dip, cx + slot * spread * (1 + (splay - 1) * 0.7), knuckleY - scale * 0.55);
      set(tip, x, knuckleY - scale * 0.75);
    } else {
      // Curled: the tip folds back toward the palm, ending below the PIP.
      set(pip, cx + slot * spread, knuckleY - scale * 0.3);
      set(dip, cx + slot * spread, knuckleY - scale * 0.15);
      set(tip, cx + slot * spread, knuckleY + scale * 0.1);
    }
  }

  // Thumb sits to the left of the index knuckle.
  const thumbSpread = thumb ? scale * 0.85 : scale * 0.2;
  const thumbY = thumbUp ? knuckleY - scale * 0.8 : knuckleY + scale * 0.35;
  set(HAND.THUMB_CMC, cx - spread * 1.6, cy + scale * 0.7);
  set(HAND.THUMB_MCP, cx - spread * 1.8, cy + scale * 0.45);
  set(HAND.THUMB_IP, cx - spread * 1.8 - thumbSpread * 0.4, (cy + thumbY) / 2);
  set(HAND.THUMB_TIP, cx - spread * 1.5 - thumbSpread, thumbY);

  return pts;
}
