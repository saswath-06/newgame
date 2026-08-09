"use client";

import type {
  FilesetResolver,
  HandLandmarker as HandLandmarkerType,
  PoseLandmarker as PoseLandmarkerType,
} from "@mediapipe/tasks-vision";

/** WasmFileset isn't exported by the package, so derive it. */
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
import type { Landmark } from "@/types/vision";

/**
 * Thin wrapper around MediaPipe Tasks Vision. Everything runs in the
 * browser via WebAssembly — frames are never uploaded anywhere.
 *
 * The heavy module and model weights load lazily on first use so the
 * arcade games don't pay for a vision bundle they never touch.
 */

/**
 * Served from public/ (copied from node_modules by scripts/copy-mediapipe-wasm.mjs)
 * so the runtime always matches the installed package and works offline.
 */
const WASM_PATH = "/mediapipe/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type VisionMode = "pose" | "hand";

export interface PoseFrame {
  landmarks: Landmark[] | null;
  timestampMs: number;
}

export interface HandFrame {
  /** Landmarks of the most prominent hand, or null. */
  landmarks: Landmark[] | null;
  timestampMs: number;
}

let filesetPromise: Promise<WasmFileset> | null = null;

async function getFileset(): Promise<WasmFileset> {
  if (!filesetPromise) {
    filesetPromise = import("@mediapipe/tasks-vision").then((m) =>
      m.FilesetResolver.forVisionTasks(WASM_PATH),
    );
  }
  return filesetPromise;
}

/**
 * Owns one landmarker and its detection loop. Create per game, and always
 * call close() — the WASM instance and GPU resources leak otherwise.
 */
export class VisionEngine {
  private pose: PoseLandmarkerType | null = null;
  private hand: HandLandmarkerType | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  private lastTimestamp = -1;
  private closed = false;

  constructor(readonly mode: VisionMode) {}

  /**
   * Load the model. Tries the GPU delegate first and falls back to CPU,
   * since headless browsers and some devices have no usable WebGL2.
   * Throws with a readable message if neither works.
   */
  async load(): Promise<void> {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await getFileset();
    if (this.closed) return;

    const delegates: ("GPU" | "CPU")[] = ["GPU", "CPU"];
    let lastError: unknown = null;
    for (const delegate of delegates) {
      try {
        if (this.mode === "pose") {
          this.pose = await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: POSE_MODEL, delegate },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } else {
          this.hand = await vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;

    // A model created after close() would leak; drop it immediately.
    if (this.closed) this.disposeLandmarkers();
  }

  get ready(): boolean {
    return Boolean(this.pose || this.hand);
  }

  /**
   * Run detection each animation frame against `video`, delivering
   * landmarks to `onFrame`. Callers should keep React state updates out
   * of this path and write to refs/canvas instead.
   */
  start(video: HTMLVideoElement, onFrame: (frame: PoseFrame | HandFrame) => void): void {
    if (this.running || this.closed) return;
    this.video = video;
    this.running = true;

    const tick = () => {
      if (!this.running || !this.video) return;
      const v = this.video;
      // MediaPipe rejects repeated or out-of-order timestamps.
      const timestampMs = Math.max(this.lastTimestamp + 1, Math.round(performance.now()));
      if (v.readyState >= 2 && v.videoWidth > 0) {
        this.lastTimestamp = timestampMs;
        try {
          if (this.pose) {
            const result = this.pose.detectForVideo(v, timestampMs);
            onFrame({
              landmarks: result.landmarks?.[0] ? [...result.landmarks[0]] : null,
              timestampMs,
            });
          } else if (this.hand) {
            const result = this.hand.detectForVideo(v, timestampMs);
            onFrame({
              landmarks: result.landmarks?.[0] ? [...result.landmarks[0]] : null,
              timestampMs,
            });
          }
        } catch {
          // A dropped frame is not fatal; keep the loop alive.
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.video = null;
  }

  private disposeLandmarkers() {
    this.pose?.close();
    this.hand?.close();
    this.pose = null;
    this.hand = null;
  }

  /** Stop detection and free the WASM resources. Not reusable after this. */
  close(): void {
    this.closed = true;
    this.stop();
    this.disposeLandmarkers();
  }
}
