import { mulberry32, shuffle } from "@/lib/random";
import { POSE_TEMPLATES, type PoseTemplate } from "@/lib/vision/poses";
import type { PlayerResult } from "@/types/game";

/**
 * Pose Perfect: five target poses, three seconds each to match. Both
 * players get the same poses from the shared seed. Score is the average
 * of the best similarity achieved during each capture window.
 */

export const POSES_PER_ROUND = 5;
export const PREVIEW_MS = 2500;
export const COUNTDOWN_MS = 3000;
export const CAPTURE_MS = 3000;
export const REVEAL_MS = 2500;

export function selectPoses(seed: number): PoseTemplate[] {
  const rng = mulberry32(seed);
  return shuffle(rng, POSE_TEMPLATES).slice(0, POSES_PER_ROUND);
}

/** Wall-clock schedule for one pose, relative to the game start. */
export interface PoseSlot {
  previewAt: number;
  countdownAt: number;
  captureAt: number;
  revealAt: number;
  endAt: number;
}

export function buildSchedule(startAt: number): PoseSlot[] {
  const slots: PoseSlot[] = [];
  let t = startAt;
  for (let i = 0; i < POSES_PER_ROUND; i++) {
    const previewAt = t;
    const countdownAt = previewAt + PREVIEW_MS;
    const captureAt = countdownAt + COUNTDOWN_MS;
    const revealAt = captureAt + CAPTURE_MS;
    const endAt = revealAt + REVEAL_MS;
    slots.push({ previewAt, countdownAt, captureAt, revealAt, endAt });
    t = endAt;
  }
  return slots;
}

export function posePerfectResult(scores: number[]): PlayerResult {
  const captured = scores.filter((s) => Number.isFinite(s));
  const total = captured.reduce((a, b) => a + b, 0);
  const average = captured.length > 0 ? total / captured.length : 0;
  return {
    rawScore: Math.round(total * 10) / 10,
    normalizedScore: Math.round(average * 10) / 10,
    completed: captured.length >= POSES_PER_ROUND,
    detail: {
      averageSimilarity: Math.round(average * 10) / 10,
      bestPose: captured.length > 0 ? Math.round(Math.max(...captured) * 10) / 10 : 0,
      posesScored: captured.length,
    },
  };
}
