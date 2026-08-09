"use client";

import { useEffect, useRef } from "react";
import {
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
  type Landmark,
} from "@/types/vision";
import { MIN_VISIBILITY } from "@/lib/vision/math";

/**
 * Mirrored camera feed with an optional skeleton overlay. The overlay
 * draws on canvas from a ref, so it never re-renders React per frame.
 */
export function CameraView({
  videoRef,
  landmarksRef,
  mode = "pose",
  showSkeleton = true,
  className = "",
  accent = "#FF4D7D",
  children,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarksRef: React.RefObject<Landmark[] | null>;
  mode?: "pose" | "hand";
  showSkeleton?: boolean;
  className?: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!showSkeleton) return;
    let raf = 0;
    const connections = mode === "pose" ? POSE_CONNECTIONS : HAND_CONNECTIONS;

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);
        const landmarks = landmarksRef.current;
        if (landmarks) {
          const visible = (l: Landmark | undefined) =>
            l !== undefined && (l.visibility === undefined || l.visibility >= MIN_VISIBILITY);

          ctx.strokeStyle = accent;
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          for (const [a, b] of connections) {
            const la = landmarks[a];
            const lb = landmarks[b];
            if (!visible(la) || !visible(lb)) continue;
            ctx.moveTo(la.x * width, la.y * height);
            ctx.lineTo(lb.x * width, lb.y * height);
          }
          ctx.stroke();

          ctx.fillStyle = "#EEF1FF";
          for (const l of landmarks) {
            if (!visible(l)) continue;
            ctx.beginPath();
            ctx.arc(l.x * width, l.y * height, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [landmarksRef, mode, showSkeleton, accent]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-edge bg-bg ${className}`}
    >
      {/* Mirrored so movements feel natural, like a real mirror. */}
      <video
        ref={videoRef}
        className="h-full w-full -scale-x-100 object-cover"
        playsInline
        muted
      />
      {showSkeleton && (
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
        />
      )}
      {children}
    </div>
  );
}
