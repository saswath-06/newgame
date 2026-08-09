"use client";

/**
 * Single shared camera stream. MediaPipe and (later) the WebRTC call both
 * consume this one MediaStream — calling getUserMedia twice on the same
 * device fails or fights on many browsers, so acquisition is refcounted.
 */

export type CameraError =
  | "denied"
  | "not_found"
  | "in_use"
  | "insecure_context"
  | "unsupported"
  | "unknown";

export interface CameraFailure {
  kind: CameraError;
  message: string;
}

const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 960 },
    height: { ideal: 720 },
    facingMode: "user",
  },
  audio: false,
};

let stream: MediaStream | null = null;
let pending: Promise<MediaStream> | null = null;
let refCount = 0;

export function classifyCameraError(error: unknown): CameraFailure {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      kind: "insecure_context",
      message: "Camera access needs HTTPS (or localhost).",
    };
  }
  if (!(error instanceof Error)) {
    return { kind: "unknown", message: "Could not start the camera." };
  }
  switch (error.name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        kind: "denied",
        message:
          "Camera permission was blocked. Allow it in your browser's address bar, then try again.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return { kind: "not_found", message: "No camera found on this device." };
    case "NotReadableError":
    case "AbortError":
      return {
        kind: "in_use",
        message: "Your camera is busy — close other apps using it and retry.",
      };
    default:
      return { kind: "unknown", message: error.message || "Could not start the camera." };
  }
}

/** Acquire (or reuse) the shared stream. Every call must be released. */
export async function acquireCamera(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("getUserMedia is unavailable"), {
      name: "NotSupportedError",
    });
  }
  refCount += 1;
  if (stream && stream.getVideoTracks().some((t) => t.readyState === "live")) {
    return stream;
  }
  if (!pending) {
    pending = navigator.mediaDevices
      .getUserMedia(CONSTRAINTS)
      .then((s) => {
        stream = s;
        pending = null;
        return s;
      })
      .catch((err) => {
        pending = null;
        refCount = Math.max(0, refCount - 1);
        throw err;
      });
  }
  return pending;
}

/** Release one hold; the stream stops once nobody is using it. */
export function releaseCamera(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
}

/** The live stream, if one is already running. */
export function currentStream(): MediaStream | null {
  return stream;
}

/**
 * Whether this device has a camera at all. Uses enumerateDevices, which
 * needs no permission — before a grant the labels are blank but the
 * entries still exist, which is all we need. Physical games are kept out
 * of match selection entirely when either player has no camera.
 */
export async function hasCamera(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return false;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === "videoinput");
  } catch {
    return false;
  }
}

/** True while a video track is live — used to detect a camera going away. */
export function isCameraLive(): boolean {
  return Boolean(stream?.getVideoTracks().some((t) => t.readyState === "live"));
}
