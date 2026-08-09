"use client";

import { Button } from "@/components/ui/Button";
import { CameraView } from "@/components/vision/CameraView";
import type { VisionHandle } from "@/hooks/useVision";
import type { Landmark } from "@/types/vision";

/**
 * Shared chrome for camera games: the mirrored feed with skeleton overlay,
 * plus honest states for model loading and camera failure. When the camera
 * can't work, the player can ask their partner to skip the round rather
 * than being stuck (spec §28).
 */
export function PhysicalGameFrame({
  vision,
  landmarksRef,
  onRequestSkip,
  skipPending,
  children,
  overlay,
  mode = "pose",
}: {
  vision: VisionHandle;
  landmarksRef: React.RefObject<Landmark[] | null>;
  onRequestSkip?: (reason: string) => void;
  skipPending?: boolean;
  children?: React.ReactNode;
  overlay?: React.ReactNode;
  mode?: "pose" | "hand";
}) {
  if (vision.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="font-display text-2xl font-bold text-danger">
          Camera unavailable
        </p>
        <p className="max-w-sm text-sm text-muted">{vision.failure?.message}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={vision.retry}>Try again</Button>
          {onRequestSkip && (
            <Button
              variant="ghost"
              disabled={skipPending}
              onClick={() =>
                onRequestSkip(vision.failure?.message ?? "Camera unavailable")
              }
            >
              {skipPending ? "Waiting for partner…" : "Ask to skip this game"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const loading =
    vision.status === "requesting_camera" || vision.status === "loading_model";

  return (
    <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
      <div className="relative min-h-0 flex-1">
        <CameraView
          videoRef={vision.videoRef}
          landmarksRef={landmarksRef}
          mode={mode}
          className="h-full w-full"
        >
          {overlay}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/75">
              <p className="animate-pulse-soft font-display text-sm text-muted">
                {vision.status === "requesting_camera"
                  ? "Waiting for camera permission…"
                  : "Loading pose model…"}
              </p>
            </div>
          )}
        </CameraView>
      </div>
      {children}
    </div>
  );
}
