"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { CameraView } from "@/components/vision/CameraView";
import { useVision } from "@/hooks/useVision";
import { analyzeFraming } from "@/lib/vision/math";
import type { FramingReport } from "@/types/vision";

const HOLD_FRAMES_REQUIRED = 20;

/**
 * Pre-game camera check: confirms the whole body is visible and gives
 * concrete guidance when it isn't. Players continue once framing has been
 * good for a moment, or override it — a partial view still works for
 * upper-body poses.
 */
export function CameraCalibration({
  onReady,
  onSkip,
  title = "Camera check",
}: {
  onReady: () => void;
  onSkip?: () => void;
  title?: string;
}) {
  const [report, setReport] = useState<FramingReport>({
    ok: false,
    issues: ["no_person"],
    message: "Step into view — we can't see anyone yet.",
    coverage: 0,
  });
  const [holdProgress, setHoldProgress] = useState(0);
  const goodFramesRef = useRef(0);
  const reportRef = useRef(report);
  const readyFiredRef = useRef(false);

  const vision = useVision("pose", true, (landmarks) => {
    const next = analyzeFraming(landmarks);
    reportRef.current = next;
    goodFramesRef.current = next.ok ? goodFramesRef.current + 1 : 0;
  });

  // Sample the ref on a timer rather than re-rendering every frame.
  useEffect(() => {
    const timer = setInterval(() => {
      setReport(reportRef.current);
      const progress = Math.min(1, goodFramesRef.current / HOLD_FRAMES_REQUIRED);
      setHoldProgress(progress);
      if (progress >= 1 && !readyFiredRef.current) {
        readyFiredRef.current = true;
        onReady();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [onReady]);

  const loading =
    vision.status === "requesting_camera" || vision.status === "loading_model";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 p-6">
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-muted">
          Prop your device up about 6–10 feet away so your whole body fits in
          frame — head to feet.
        </p>
      </div>

      {vision.status === "error" ? (
        <div className="glass w-full rounded-2xl p-6 text-center">
          <p className="font-display text-lg font-bold text-danger">
            Camera unavailable
          </p>
          <p className="mt-2 text-sm text-muted">{vision.failure?.message}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={vision.retry}>Try again</Button>
            {onSkip && (
              <Button variant="ghost" onClick={onSkip}>
                Skip camera games
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <CameraView
            videoRef={vision.videoRef}
            landmarksRef={vision.landmarksRef}
            className="aspect-video w-full"
            accent={report.ok ? "#4ADE9C" : "#FF4D7D"}
          >
            {/* Silhouette guide. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`h-[86%] w-[34%] rounded-[45%] border-2 border-dashed transition-colors ${
                  report.ok ? "border-go/60" : "border-white/20"
                }`}
              />
            </div>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg/70">
                <p className="animate-pulse-soft font-display text-sm text-muted">
                  {vision.status === "requesting_camera"
                    ? "Waiting for camera permission…"
                    : "Loading pose model…"}
                </p>
              </div>
            )}
          </CameraView>

          <div className="w-full">
            <div className="flex items-center justify-between text-sm">
              <span
                className={`font-display font-bold ${
                  report.ok ? "text-go" : "text-peach"
                }`}
              >
                {report.ok ? "Perfect framing" : "Adjust your setup"}
              </span>
              <span className="text-xs text-muted">
                {vision.detecting ? "Body detected" : "No body detected"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{report.message}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-rose to-go"
                animate={{ width: `${holdProgress * 100}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-muted">
              {holdProgress >= 1
                ? "You're set!"
                : "Hold that position for a couple of seconds"}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onReady} variant={report.ok ? "primary" : "ghost"}>
              I&apos;m ready
            </Button>
            {onSkip && (
              <Button variant="ghost" onClick={onSkip}>
                Skip camera games
              </Button>
            )}
          </div>
        </>
      )}

      <p className="max-w-md text-center text-xs leading-relaxed text-muted/70">
        Pose detection runs entirely on your device. Your camera frames are
        never uploaded for scoring, and nothing is recorded.
      </p>
    </div>
  );
}
