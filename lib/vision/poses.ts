import type { PoseAngles } from "@/types/vision";

/**
 * Target poses as joint-angle templates rather than reference images —
 * scoring compares angles, so a template is just the set of angles a
 * correctly-struck pose produces.
 *
 * Reference values: a relaxed arm at the side gives shoulder ≈ 15°;
 * straight out sideways ≈ 90°; straight overhead ≈ 175°. A straight limb
 * gives elbow/knee ≈ 175°. Standing straight gives hip ≈ 175°.
 */

export interface PoseTemplate {
  id: string;
  name: string;
  /** Short cue shown to the player. */
  hint: string;
  emoji: string;
  angles: PoseAngles;
  /** Angles to ignore when scoring (e.g. legs in an upper-body pose). */
  skip?: (keyof PoseAngles)[];
  /** True when the pose requires standing on one leg. */
  singleLeg?: boolean;
}

const STRAIGHT = 175;
const RELAXED_SHOULDER = 18;

export const POSE_TEMPLATES: PoseTemplate[] = [
  {
    id: "arms_overhead",
    name: "Sky Reach",
    hint: "Both arms straight overhead",
    emoji: "🙌",
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: 172, rightShoulder: 172,
      leftHip: STRAIGHT, rightHip: STRAIGHT,
      leftKnee: STRAIGHT, rightKnee: STRAIGHT,
      bodyLean: 0,
    },
  },
  {
    id: "star",
    name: "Star Pose",
    hint: "Arms and legs out wide — be a star",
    emoji: "⭐",
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: 95, rightShoulder: 95,
      leftHip: 160, rightHip: 160,
      leftKnee: STRAIGHT, rightKnee: STRAIGHT,
      bodyLean: 0,
    },
  },
  {
    id: "t_pose",
    name: "The T",
    hint: "Arms straight out to the sides",
    emoji: "🇹",
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: 90, rightShoulder: 90,
      leftHip: STRAIGHT, rightHip: STRAIGHT,
      leftKnee: STRAIGHT, rightKnee: STRAIGHT,
      bodyLean: 0,
    },
  },
  {
    id: "one_up_one_out",
    name: "Half Mast",
    hint: "Right arm up, left arm out sideways",
    emoji: "🙋",
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: 90, rightShoulder: 172,
      leftHip: STRAIGHT, rightHip: STRAIGHT,
      leftKnee: STRAIGHT, rightKnee: STRAIGHT,
      bodyLean: 0,
    },
  },
  {
    id: "squat",
    name: "Deep Squat",
    hint: "Squat down, arms forward",
    emoji: "🏋️",
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: 80, rightShoulder: 80,
      leftHip: 85, rightHip: 85,
      leftKnee: 80, rightKnee: 80,
      bodyLean: 0,
    },
  },
  {
    id: "lean_left",
    name: "Teapot",
    hint: "Lean to your left, right arm overhead",
    emoji: "🫖",
    angles: {
      leftElbow: 60, rightElbow: STRAIGHT,
      leftShoulder: 30, rightShoulder: 165,
      leftHip: 160, rightHip: 160,
      leftKnee: STRAIGHT, rightKnee: STRAIGHT,
      bodyLean: -25,
    },
  },
  {
    id: "flex",
    name: "Double Biceps",
    hint: "Elbows bent, show us those arms",
    emoji: "💪",
    angles: {
      leftElbow: 45, rightElbow: 45,
      leftShoulder: 88, rightShoulder: 88,
      leftHip: STRAIGHT, rightHip: STRAIGHT,
      leftKnee: STRAIGHT, rightKnee: STRAIGHT,
      bodyLean: 0,
    },
  },
  {
    id: "disco",
    name: "Disco",
    hint: "One arm up diagonally, one down — strike it",
    emoji: "🕺",
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: RELAXED_SHOULDER, rightShoulder: 140,
      leftHip: STRAIGHT, rightHip: 165,
      leftKnee: STRAIGHT, rightKnee: 160,
      bodyLean: -10,
    },
  },
];

/** Balance poses: one leg raised, judged on hold time rather than shape. */
export const BALANCE_TEMPLATES: PoseTemplate[] = [
  {
    id: "flamingo",
    name: "Flamingo",
    hint: "Right knee up, arms wherever you like",
    emoji: "🦩",
    singleLeg: true,
    skip: ["leftElbow", "rightElbow", "leftShoulder", "rightShoulder"],
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: RELAXED_SHOULDER, rightShoulder: RELAXED_SHOULDER,
      leftHip: STRAIGHT, rightHip: 95,
      leftKnee: STRAIGHT, rightKnee: 85,
      bodyLean: 0,
    },
  },
  {
    id: "flamingo_wings",
    name: "Flamingo Wings",
    hint: "Right knee up, arms straight out sideways",
    emoji: "🦅",
    singleLeg: true,
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: 90, rightShoulder: 90,
      leftHip: STRAIGHT, rightHip: 95,
      leftKnee: STRAIGHT, rightKnee: 85,
      bodyLean: 0,
    },
  },
  {
    id: "flamingo_reach",
    name: "Sky Flamingo",
    hint: "Right knee up, both arms overhead",
    emoji: "🌟",
    singleLeg: true,
    angles: {
      leftElbow: STRAIGHT, rightElbow: STRAIGHT,
      leftShoulder: 172, rightShoulder: 172,
      leftHip: STRAIGHT, rightHip: 95,
      leftKnee: STRAIGHT, rightKnee: 85,
      bodyLean: 0,
    },
  },
];

export function getPoseTemplate(id: string): PoseTemplate | null {
  return (
    POSE_TEMPLATES.find((p) => p.id === id) ??
    BALANCE_TEMPLATES.find((p) => p.id === id) ??
    null
  );
}

/** Playful copy keyed to how close the attempt was. */
export function similarityFeedback(score: number): string {
  if (score >= 92) return "Flawless. Genuinely.";
  if (score >= 80) return "Almost perfect!";
  if (score >= 65) return "Pretty close!";
  if (score >= 50) return "We can see what you were going for.";
  if (score >= 30) return "Bold interpretation.";
  return "What are you doing? 😂";
}
