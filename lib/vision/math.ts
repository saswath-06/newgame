import {
  POSE,
  type FramingIssue,
  type FramingReport,
  type Landmark,
  type NormalizedPose,
  type PoseAngles,
} from "@/types/vision";

/**
 * Pure pose math. No MediaPipe, no DOM — feed it landmark arrays and it
 * works, which is what makes the physical games testable.
 *
 * Everything here compares ANGLES and relative geometry rather than raw
 * pixel coordinates, so a tall person far from the camera and a short
 * person close to it can strike "the same" pose and score the same.
 */

/** Landmarks below this visibility are treated as unknown. */
export const MIN_VISIBILITY = 0.5;

export function isVisible(l: Landmark | undefined): boolean {
  return l !== undefined && (l.visibility === undefined || l.visibility >= MIN_VISIBILITY);
}

export function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

/**
 * Interior angle ABC in degrees (0–180), where B is the vertex.
 * Straight limb ⇒ 180°, fully folded ⇒ 0°.
 */
export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
  if (magA === 0 || magC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Smallest signed difference between two angles, in degrees. */
export function angleDifference(a: number, b: number): number {
  return Math.abs(a - b);
}

const SCORING_LANDMARKS = [
  POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER,
  POSE.LEFT_ELBOW, POSE.RIGHT_ELBOW,
  POSE.LEFT_WRIST, POSE.RIGHT_WRIST,
  POSE.LEFT_HIP, POSE.RIGHT_HIP,
  POSE.LEFT_KNEE, POSE.RIGHT_KNEE,
  POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE,
];

export function calculateAngles(landmarks: Landmark[]): PoseAngles {
  const at = (i: number) => landmarks[i];
  const shoulderMid = midpoint(at(POSE.LEFT_SHOULDER), at(POSE.RIGHT_SHOULDER));
  const hipMid = midpoint(at(POSE.LEFT_HIP), at(POSE.RIGHT_HIP));

  // Torso tilt from vertical. Screen y grows downward, so a torso leaning
  // to the player's screen-left yields a negative angle.
  const dx = shoulderMid.x - hipMid.x;
  const dy = hipMid.y - shoulderMid.y;
  const bodyLean = (Math.atan2(dx, Math.max(1e-6, dy)) * 180) / Math.PI;

  return {
    leftElbow: calculateAngle(at(POSE.LEFT_SHOULDER), at(POSE.LEFT_ELBOW), at(POSE.LEFT_WRIST)),
    rightElbow: calculateAngle(at(POSE.RIGHT_SHOULDER), at(POSE.RIGHT_ELBOW), at(POSE.RIGHT_WRIST)),
    // Shoulder angle = arm relative to the torso (hip → shoulder → elbow).
    leftShoulder: calculateAngle(at(POSE.LEFT_HIP), at(POSE.LEFT_SHOULDER), at(POSE.LEFT_ELBOW)),
    rightShoulder: calculateAngle(at(POSE.RIGHT_HIP), at(POSE.RIGHT_SHOULDER), at(POSE.RIGHT_ELBOW)),
    leftHip: calculateAngle(at(POSE.LEFT_SHOULDER), at(POSE.LEFT_HIP), at(POSE.LEFT_KNEE)),
    rightHip: calculateAngle(at(POSE.RIGHT_SHOULDER), at(POSE.RIGHT_HIP), at(POSE.RIGHT_KNEE)),
    leftKnee: calculateAngle(at(POSE.LEFT_HIP), at(POSE.LEFT_KNEE), at(POSE.LEFT_ANKLE)),
    rightKnee: calculateAngle(at(POSE.RIGHT_HIP), at(POSE.RIGHT_KNEE), at(POSE.RIGHT_ANKLE)),
    bodyLean,
  };
}

/**
 * Recenter on the body center and rescale by torso length, so distance
 * from the camera and position in frame stop mattering.
 */
export function normalizePose(landmarks: Landmark[]): NormalizedPose | null {
  if (landmarks.length < 33) return null;
  const shoulderMid = midpoint(landmarks[POSE.LEFT_SHOULDER], landmarks[POSE.RIGHT_SHOULDER]);
  const hipMid = midpoint(landmarks[POSE.LEFT_HIP], landmarks[POSE.RIGHT_HIP]);
  const center = { x: (shoulderMid.x + hipMid.x) / 2, y: (shoulderMid.y + hipMid.y) / 2 };
  const torsoLength = distance(shoulderMid, hipMid);
  if (torsoLength < 1e-4) return null;

  const normalized = landmarks.map((l) => ({
    x: (l.x - center.x) / torsoLength,
    y: (l.y - center.y) / torsoLength,
    z: l.z / torsoLength,
    visibility: l.visibility,
  }));

  const visibilities = SCORING_LANDMARKS.map((i) => landmarks[i]?.visibility ?? 1);
  const confidence = visibilities.reduce((a, b) => a + b, 0) / visibilities.length;

  return {
    landmarks: normalized,
    angles: calculateAngles(landmarks),
    center,
    torsoLength,
    confidence,
  };
}

/** Weights: limbs read most clearly on camera, so they dominate scoring. */
const ANGLE_WEIGHTS: Record<keyof PoseAngles, number> = {
  leftElbow: 1.2,
  rightElbow: 1.2,
  leftShoulder: 1.4,
  rightShoulder: 1.4,
  leftHip: 1,
  rightHip: 1,
  leftKnee: 1,
  rightKnee: 1,
  bodyLean: 0.8,
};

/** Angle error at or beyond this contributes zero credit for that joint. */
const ANGLE_TOLERANCE = 75;

/**
 * How much the single worst joint counts. Without this, a pose that gets
 * most joints "free" (straight legs, straight elbows) but holds the arms
 * completely wrong still averages well above chance. Pose matching should
 * reward getting EVERY joint right, so the worst joint pulls real weight.
 */
const WORST_JOINT_WEIGHT = 0.4;

/**
 * Compare two poses by joint angle, 0–100. Joints whose landmarks are not
 * confidently visible in the OBSERVED pose are skipped rather than
 * punished — a hidden knee shouldn't tank an otherwise good pose.
 */
export function comparePoses(
  target: PoseAngles,
  observed: PoseAngles,
  skip: (keyof PoseAngles)[] = [],
): number {
  let weightSum = 0;
  let scoreSum = 0;
  let worst = 1;
  for (const key of Object.keys(ANGLE_WEIGHTS) as (keyof PoseAngles)[]) {
    if (skip.includes(key)) continue;
    const weight = ANGLE_WEIGHTS[key];
    const error = angleDifference(target[key], observed[key]);
    const credit = Math.max(0, 1 - error / ANGLE_TOLERANCE);
    scoreSum += credit * weight;
    weightSum += weight;
    worst = Math.min(worst, credit);
  }
  if (weightSum === 0) return 0;
  const mean = scoreSum / weightSum;
  const blended = mean * (1 - WORST_JOINT_WEIGHT) + worst * WORST_JOINT_WEIGHT;
  return Math.round(blended * 1000) / 10;
}

/** Mirror a pose's angles so a leader and their mirror can be compared. */
export function mirrorAngles(angles: PoseAngles): PoseAngles {
  return {
    leftElbow: angles.rightElbow,
    rightElbow: angles.leftElbow,
    leftShoulder: angles.rightShoulder,
    rightShoulder: angles.leftShoulder,
    leftHip: angles.rightHip,
    rightHip: angles.leftHip,
    leftKnee: angles.rightKnee,
    rightKnee: angles.leftKnee,
    bodyLean: -angles.bodyLean,
  };
}

/**
 * Mean landmark displacement between two normalized poses, in torso
 * units. Scale-invariant, so it measures real motion rather than the
 * player drifting toward the camera.
 */
export function calculateMotion(
  previous: NormalizedPose,
  current: NormalizedPose,
): number {
  let sum = 0;
  let count = 0;
  for (const i of SCORING_LANDMARKS) {
    const a = previous.landmarks[i];
    const b = current.landmarks[i];
    if (!a || !b) continue;
    if (!isVisible(a) || !isVisible(b)) continue;
    sum += Math.hypot(a.x - b.x, a.y - b.y);
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Sway of the body center across a history window, in torso units.
 * Used by Balance Battle to tell "holding steady" from "wobbling".
 */
export function calculateBalanceStability(history: NormalizedPose[]): number {
  if (history.length < 2) return 0;
  const centers = history.map((p) => ({
    x: p.center.x / p.torsoLength,
    y: p.center.y / p.torsoLength,
  }));
  const meanX = centers.reduce((a, c) => a + c.x, 0) / centers.length;
  const meanY = centers.reduce((a, c) => a + c.y, 0) / centers.length;
  const variance =
    centers.reduce((a, c) => a + (c.x - meanX) ** 2 + (c.y - meanY) ** 2, 0) /
    centers.length;
  return Math.sqrt(variance);
}

/**
 * Exponential smoothing over landmark positions. MediaPipe jitters a few
 * percent frame to frame; without this the UI numbers flicker unpleasantly.
 */
export function smoothLandmarks(
  previous: Landmark[] | null,
  current: Landmark[],
  alpha = 0.5,
): Landmark[] {
  if (!previous || previous.length !== current.length) return current;
  return current.map((c, i) => {
    const p = previous[i];
    return {
      x: p.x + (c.x - p.x) * alpha,
      y: p.y + (c.y - p.y) * alpha,
      z: p.z + (c.z - p.z) * alpha,
      visibility: c.visibility,
    };
  });
}

/** Exponential smoothing for a scalar score. */
export function smoothValue(previous: number | null, current: number, alpha = 0.35): number {
  if (previous === null) return current;
  return previous + (current - previous) * alpha;
}

/**
 * Judge camera framing for full-body games. Coverage is head-to-ankle
 * height as a fraction of frame height; the sweet spot leaves margin
 * above and below so the player can raise arms and lift a leg.
 */
export function analyzeFraming(landmarks: Landmark[] | null): FramingReport {
  if (!landmarks || landmarks.length < 33) {
    return {
      ok: false,
      issues: ["no_person"],
      message: "Step into view — we can't see anyone yet.",
      coverage: 0,
    };
  }

  const issues: FramingIssue[] = [];
  const head = landmarks[POSE.NOSE];
  const ankles = [landmarks[POSE.LEFT_ANKLE], landmarks[POSE.RIGHT_ANKLE]];
  const hips = midpoint(landmarks[POSE.LEFT_HIP], landmarks[POSE.RIGHT_HIP]);
  const shoulders = midpoint(landmarks[POSE.LEFT_SHOULDER], landmarks[POSE.RIGHT_SHOULDER]);

  const anklesVisible = ankles.some(isVisible);
  const lowest = anklesVisible
    ? Math.max(...ankles.filter(isVisible).map((a) => a.y))
    : hips.y;
  const coverage = Math.max(0, Math.min(1, lowest - head.y));

  if (!anklesVisible) issues.push("lower_body_hidden");
  if (coverage > 0.92) issues.push("too_close");
  else if (anklesVisible && coverage < 0.45) issues.push("too_far");

  const centerX = (shoulders.x + hips.x) / 2;
  if (centerX < 0.2 || centerX > 0.8) issues.push("off_center");

  const confidence =
    SCORING_LANDMARKS.map((i) => landmarks[i]?.visibility ?? 1).reduce((a, b) => a + b, 0) /
    SCORING_LANDMARKS.length;
  if (confidence < 0.55) issues.push("low_confidence");

  return {
    ok: issues.length === 0,
    issues,
    message: framingMessage(issues[0]),
    coverage,
  };
}

function framingMessage(issue: FramingIssue | undefined): string {
  switch (issue) {
    case "no_person":
      return "Step into view — we can't see anyone yet.";
    case "lower_body_hidden":
      return "Step back until your feet are in frame.";
    case "too_close":
      return "A little too close — back up so you have room to move.";
    case "too_far":
      return "Come a bit closer, you're small in frame.";
    case "off_center":
      return "Shuffle toward the middle of the frame.";
    case "low_confidence":
      return "Hard to see you — try turning up the lights.";
    default:
      return "Looking great — you're all set.";
  }
}
