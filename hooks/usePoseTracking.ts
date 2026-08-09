"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVision, type VisionHandle } from "@/hooks/useVision";
import { calculateMotion, normalizePose } from "@/lib/vision/math";
import { BaselineCollector, DEFAULT_BASELINE, type Baseline } from "@/lib/vision/calibration";
import type { Landmark, NormalizedPose } from "@/types/vision";

export interface PoseTracking {
  vision: VisionHandle;
  /** Latest normalized pose. Read in loops, not in render. */
  poseRef: React.RefObject<NormalizedPose | null>;
  /** Per-frame motion magnitude, in torso units. */
  motionRef: React.RefObject<number>;
  /** Recent poses, for sway/stability measures. */
  historyRef: React.RefObject<NormalizedPose[]>;
  /** Feed motion samples into the baseline while true. */
  setCalibrating: (on: boolean) => void;
  /** Build the baseline from collected samples. */
  finishCalibration: () => Baseline;
  baselineRef: React.RefObject<Baseline>;
}

const HISTORY_LENGTH = 30;

/**
 * Shared plumbing for pose games: normalization, motion, a rolling
 * history for sway, and noise-floor calibration. Everything lands in refs
 * so games can sample at frame rate without re-rendering React.
 */
export function usePoseTracking(
  onFrame?: (pose: NormalizedPose | null, landmarks: Landmark[] | null) => void,
): PoseTracking {
  const poseRef = useRef<NormalizedPose | null>(null);
  const motionRef = useRef(0);
  const historyRef = useRef<NormalizedPose[]>([]);
  const baselineRef = useRef<Baseline>(DEFAULT_BASELINE);
  const collectorRef = useRef(new BaselineCollector());
  const calibratingRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const handleFrame = useCallback((landmarks: Landmark[] | null) => {
    const normalized = landmarks ? normalizePose(landmarks) : null;
    if (normalized && poseRef.current) {
      motionRef.current = calculateMotion(poseRef.current, normalized);
      if (calibratingRef.current) collectorRef.current.add(motionRef.current);
    }
    poseRef.current = normalized;
    if (normalized) {
      historyRef.current.push(normalized);
      if (historyRef.current.length > HISTORY_LENGTH) historyRef.current.shift();
    }
    onFrameRef.current?.(normalized, landmarks);
  }, []);

  const vision = useVision("pose", true, handleFrame);

  const setCalibrating = useCallback((on: boolean) => {
    calibratingRef.current = on;
    if (on) collectorRef.current.reset();
  }, []);

  const finishCalibration = useCallback(() => {
    calibratingRef.current = false;
    baselineRef.current = collectorRef.current.build();
    return baselineRef.current;
  }, []);

  return {
    vision,
    poseRef,
    motionRef,
    historyRef,
    setCalibrating,
    finishCalibration,
    baselineRef,
  };
}
