"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireCamera,
  classifyCameraError,
  isCameraLive,
  releaseCamera,
  type CameraFailure,
} from "@/lib/vision/camera";
import { VisionEngine, type VisionMode } from "@/lib/vision/engine";
import { smoothLandmarks } from "@/lib/vision/math";
import type { Landmark } from "@/types/vision";

export type VisionStatus =
  | "idle"
  | "requesting_camera"
  | "loading_model"
  | "running"
  | "error";

export interface VisionHandle {
  status: VisionStatus;
  failure: CameraFailure | null;
  /** Attach to a <video> element; the hook wires up the stream. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Latest smoothed landmarks. A REF — read it in loops, not in render. */
  landmarksRef: React.RefObject<Landmark[] | null>;
  /** True once at least one frame has produced landmarks. */
  detecting: boolean;
  retry: () => void;
}

/**
 * Runs a vision engine against the shared camera. Landmarks land in a ref
 * rather than state so games can sample at 30–60fps without re-rendering
 * React on every frame (spec §31).
 *
 * `onFrame` fires for every processed frame; keep it cheap.
 */
export function useVision(
  mode: VisionMode,
  enabled: boolean,
  onFrame?: (landmarks: Landmark[] | null, timestampMs: number) => void,
): VisionHandle {
  const [status, setStatus] = useState<VisionStatus>("idle");
  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const onFrameRef = useRef(onFrame);
  const detectingRef = useRef(false);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let engine: VisionEngine | null = null;
    let held = false;
    let liveCheck: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      setStatus("requesting_camera");
      setFailure(null);
      let stream: MediaStream;
      try {
        stream = await acquireCamera();
        held = true;
      } catch (err) {
        if (!cancelled) {
          setFailure(classifyCameraError(err));
          setStatus("error");
        }
        return;
      }
      if (cancelled) return;

      const video = videoRef.current;
      if (!video) {
        setFailure({ kind: "unknown", message: "Video element unavailable." });
        setStatus("error");
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch {
        // Autoplay can reject; detection still works once frames flow.
      }

      setStatus("loading_model");
      engine = new VisionEngine(mode);
      try {
        await engine.load();
      } catch (err) {
        if (!cancelled) {
          const detail = err instanceof Error ? ` (${err.message})` : "";
          setFailure({
            kind: "unknown",
            message: `Could not load the vision model. Check your connection and try again.${detail}`,
          });
          setStatus("error");
        }
        return;
      }
      if (cancelled) {
        engine.close();
        return;
      }

      engine.start(video, ({ landmarks, timestampMs }) => {
        landmarksRef.current = landmarks
          ? smoothLandmarks(landmarksRef.current, landmarks)
          : null;
        const has = landmarksRef.current !== null;
        if (has !== detectingRef.current) {
          detectingRef.current = has;
          setDetecting(has);
        }
        onFrameRef.current?.(landmarksRef.current, timestampMs);
      });
      setStatus("running");

      // Surface an unplugged/revoked camera instead of silently freezing.
      liveCheck = setInterval(() => {
        if (!isCameraLive()) {
          setFailure({
            kind: "in_use",
            message: "The camera stopped. Reconnect it and try again.",
          });
          setStatus("error");
        }
      }, 2000);
    };

    void run();

    // Captured now so cleanup detaches the element this effect attached to.
    const attachedVideo = videoRef.current;

    return () => {
      cancelled = true;
      if (liveCheck) clearInterval(liveCheck);
      engine?.close();
      if (attachedVideo) attachedVideo.srcObject = null;
      landmarksRef.current = null;
      detectingRef.current = false;
      if (held) releaseCamera();
    };
  }, [mode, enabled, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { status, failure, videoRef, landmarksRef, detecting, retry };
}
