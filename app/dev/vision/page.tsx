"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CameraView } from "@/components/vision/CameraView";
import { useVision } from "@/hooks/useVision";
import {
  analyzeFraming,
  calculateMotion,
  calculateBalanceStability,
  comparePoses,
  normalizePose,
} from "@/lib/vision/math";
import { POSE_TEMPLATES, similarityFeedback } from "@/lib/vision/poses";
import { GESTURE_INFO, recognizeGesture } from "@/lib/vision/gestures";
import type { GestureName, NormalizedPose, PoseAngles } from "@/types/vision";

/**
 * Development-only vision inspector: live landmark overlay, joint angles,
 * pose-template scoring, motion/stability readouts, and gesture detection.
 * Used to validate detection heuristics without running a whole match.
 */
export default function VisionDevPage() {
  const [mode, setMode] = useState<"pose" | "hand">("pose");
  const [enabled, setEnabled] = useState(false);
  const [templateIndex, setTemplateIndex] = useState(0);

  if (process.env.NODE_ENV === "production") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-muted">Not available in production.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">
          Vision <span className="text-gradient-duo">Inspector</span>
        </h1>
        <Link href="/" className="text-xs text-muted underline-offset-4 hover:underline">
          Back to arcade
        </Link>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant={mode === "pose" ? "primary" : "ghost"}
          onClick={() => setMode("pose")}
        >
          Pose
        </Button>
        <Button
          variant={mode === "hand" ? "primary" : "ghost"}
          onClick={() => setMode("hand")}
        >
          Hands
        </Button>
        <Button variant="ghost" onClick={() => setEnabled((e) => !e)}>
          {enabled ? "Stop camera" : "Start camera"}
        </Button>
      </div>

      {enabled ? (
        mode === "pose" ? (
          <PoseInspector
            templateIndex={templateIndex}
            onCycleTemplate={() =>
              setTemplateIndex((i) => (i + 1) % POSE_TEMPLATES.length)
            }
          />
        ) : (
          <HandInspector />
        )
      ) : (
        <p className="mt-10 text-sm text-muted">
          Start the camera to inspect live landmarks. Everything runs locally;
          no frames leave this device.
        </p>
      )}
    </main>
  );
}

function PoseInspector({
  templateIndex,
  onCycleTemplate,
}: {
  templateIndex: number;
  onCycleTemplate: () => void;
}) {
  const template = POSE_TEMPLATES[templateIndex];
  const normalizedRef = useRef<NormalizedPose | null>(null);
  const previousRef = useRef<NormalizedPose | null>(null);
  const historyRef = useRef<NormalizedPose[]>([]);
  const motionRef = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    angles: PoseAngles | null;
    similarity: number;
    motion: number;
    stability: number;
    framing: string;
    confidence: number;
  }>({
    angles: null,
    similarity: 0,
    motion: 0,
    stability: 0,
    framing: "—",
    confidence: 0,
  });

  const vision = useVision("pose", true, (landmarks) => {
    const normalized = landmarks ? normalizePose(landmarks) : null;
    if (normalized && normalizedRef.current) {
      motionRef.current = calculateMotion(normalizedRef.current, normalized);
    }
    previousRef.current = normalizedRef.current;
    normalizedRef.current = normalized;
    if (normalized) {
      historyRef.current.push(normalized);
      if (historyRef.current.length > 30) historyRef.current.shift();
    }
  });

  // Sample at 5Hz for display — never re-render per frame.
  useEffect(() => {
    const timer = setInterval(() => {
      const normalized = normalizedRef.current;
      const framing = analyzeFraming(vision.landmarksRef.current);
      setSnapshot({
        angles: normalized?.angles ?? null,
        similarity: normalized
          ? comparePoses(template.angles, normalized.angles, template.skip)
          : 0,
        motion: motionRef.current,
        stability: calculateBalanceStability(historyRef.current),
        framing: framing.message,
        confidence: normalized?.confidence ?? 0,
      });
    }, 200);
    return () => clearInterval(timer);
  }, [template, vision.landmarksRef]);

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <div>
        <CameraView
          videoRef={vision.videoRef}
          landmarksRef={vision.landmarksRef}
          className="aspect-video w-full"
        />
        <p className="mt-2 text-xs text-muted">
          {vision.status} · {snapshot.framing}
        </p>
        {vision.failure && (
          <p className="mt-1 text-xs text-danger">{vision.failure.message}</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-bold">
              {template.emoji} {template.name}
            </p>
            <Button size="md" variant="ghost" onClick={onCycleTemplate}>
              Next pose
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted">{template.hint}</p>
          <p className="mt-3 font-display text-5xl font-extrabold text-gradient-duo">
            {snapshot.similarity.toFixed(1)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {similarityFeedback(snapshot.similarity)}
          </p>
        </div>

        <div className="glass grid grid-cols-3 gap-2 rounded-2xl p-4 text-center">
          <Stat label="Motion" value={snapshot.motion.toFixed(3)} />
          <Stat label="Sway" value={snapshot.stability.toFixed(3)} />
          <Stat label="Confidence" value={snapshot.confidence.toFixed(2)} />
        </div>

        {snapshot.angles && (
          <div className="glass rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Joint angles
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
              {(Object.keys(snapshot.angles) as (keyof PoseAngles)[]).map((key) => (
                <div key={key} className="flex justify-between">
                  <span className="text-muted">{key}</span>
                  <span className="text-ink">
                    {snapshot.angles![key].toFixed(0)}° / {template.angles[key].toFixed(0)}°
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HandInspector() {
  const [reading, setReading] = useState<{
    gesture: GestureName | null;
    confidence: number;
  }>({ gesture: null, confidence: 0 });
  const readingRef = useRef(reading);

  const vision = useVision("hand", true, (landmarks) => {
    readingRef.current = recognizeGesture(landmarks);
  });

  useEffect(() => {
    const timer = setInterval(() => setReading(readingRef.current), 150);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <div>
        <CameraView
          videoRef={vision.videoRef}
          landmarksRef={vision.landmarksRef}
          mode="hand"
          accent="#8B5CF6"
          className="aspect-video w-full"
        />
        <p className="mt-2 text-xs text-muted">{vision.status}</p>
      </div>
      <div className="glass rounded-2xl p-6 text-center">
        <p className="text-8xl">
          {reading.gesture ? GESTURE_INFO[reading.gesture].emoji : "🫥"}
        </p>
        <p className="mt-4 font-display text-xl font-bold">
          {reading.gesture ? GESTURE_INFO[reading.gesture].label : "No gesture"}
        </p>
        <p className="mt-1 text-sm text-muted">
          confidence {reading.confidence.toFixed(2)}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3 text-2xl">
          {Object.values(GESTURE_INFO).map((g) => (
            <span key={g.label} title={g.label}>
              {g.emoji}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-lg text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
