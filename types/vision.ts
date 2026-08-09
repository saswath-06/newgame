/**
 * Vision types. Deliberately free of MediaPipe imports so every algorithm
 * in lib/vision can be unit-tested with plain landmark arrays.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** MediaPipe supplies this for pose; hands omit it. */
  visibility?: number;
}

/** Pose landmark indices (MediaPipe BlazePose 33-point model). */
export const POSE = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT: 31,
  RIGHT_FOOT: 32,
} as const;

export const POSE_LANDMARK_COUNT = 33;

/** Skeleton connections for the debug overlay. */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];

/** Hand landmark indices (MediaPipe 21-point model). */
export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const HAND_LANDMARK_COUNT = 21;

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Joint angles (degrees) that describe a pose independent of camera. */
export interface PoseAngles {
  leftElbow: number;
  rightElbow: number;
  leftShoulder: number;
  rightShoulder: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  /** Torso tilt from vertical; negative = leaning left on screen. */
  bodyLean: number;
}

/** A pose normalized for position and scale, plus derived measures. */
export interface NormalizedPose {
  /** Landmarks recentered on the body center and scaled by torso size. */
  landmarks: Landmark[];
  angles: PoseAngles;
  /** Midpoint of shoulders and hips in original coordinates. */
  center: { x: number; y: number };
  /** Shoulder-to-hip distance used as the scale unit. */
  torsoLength: number;
  /** Mean visibility of the landmarks that matter for scoring. */
  confidence: number;
}

export type FramingIssue =
  | "no_person"
  | "too_close"
  | "too_far"
  | "off_center"
  | "lower_body_hidden"
  | "low_confidence";

export interface FramingReport {
  ok: boolean;
  issues: FramingIssue[];
  /** Human-readable guidance for the top issue. */
  message: string;
  /** 0–1, how much of the frame the body occupies. */
  coverage: number;
}

export type GestureName =
  | "open_palm"
  | "fist"
  | "peace"
  | "thumbs_up"
  | "pointing";

export interface GestureReading {
  gesture: GestureName | null;
  confidence: number;
}
