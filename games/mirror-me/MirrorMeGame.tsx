"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PhysicalGameFrame } from "@/components/vision/PhysicalGameFrame";
import { usePoseTracking } from "@/hooks/usePoseTracking";
import { smoothValue } from "@/lib/vision/math";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import type { PoseAngles } from "@/types/vision";
import {
  BROADCAST_MS,
  SAMPLE_INTERVAL_MS,
  STREAK_THRESHOLD,
  buildSchedule,
  isMirroring,
  leaderFor,
  mirrorFeedback,
  mirrorResult,
  mirrorSimilarity,
  phaseAt,
  type MirrorPhase,
} from "./logic";

const ANGLE_KEYS: (keyof PoseAngles)[] = [
  "leftElbow", "rightElbow", "leftShoulder", "rightShoulder",
  "leftHip", "rightHip", "leftKnee", "rightKnee", "bodyLean",
];

/** Angles travel as a compact number array — never camera frames. */
function packAngles(a: PoseAngles): number[] {
  return ANGLE_KEYS.map((k) => Math.round(a[k] * 10) / 10);
}

function unpackAngles(values: unknown): PoseAngles | null {
  if (!Array.isArray(values) || values.length !== ANGLE_KEYS.length) return null;
  const out = {} as PoseAngles;
  for (let i = 0; i < ANGLE_KEYS.length; i++) {
    const v = values[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out[ANGLE_KEYS[i]] = v;
  }
  return out;
}

export function MirrorMeGame({
  role,
  playerName,
  partnerName,
  startAt,
  now,
  sendGameEvent,
  onGameEvent,
  onFinish,
  partnerResult,
  requestSkip,
  skipPending,
}: GameProps) {
  const schedule = useMemo(() => buildSchedule(startAt), [startAt]);
  const tracking = usePoseTracking();
  const { poseRef } = tracking;

  const [view, setView] = useState<{
    phase: MirrorPhase;
    score: number;
    streak: number;
    secondsLeft: number;
  }>({ phase: "intro", score: 0, streak: 0, secondsLeft: 0 });

  const leaderAnglesRef = useRef<PoseAngles | null>(null);
  const samplesRef = useRef<number[]>([]);
  const smoothedRef = useRef<number | null>(null);
  const streakRef = useRef(0);
  const phaseRef = useRef<MirrorPhase>("intro");
  const lastBroadcastRef = useRef(0);
  const lastSampleRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    return onGameEvent((payload) => {
      const angles = unpackAngles(payload.angles);
      if (angles) leaderAnglesRef.current = angles;
    });
  }, [onGameEvent]);

  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const t = now();
      const phase = phaseAt(schedule, t);

      if (phase !== phaseRef.current) {
        if (phase === "round1" || phase === "round2") soundManager.play("go");
        if (phase === "swap") soundManager.play("point");
        // Fresh mirror turn: drop the leader's stale pose.
        leaderAnglesRef.current = null;
        smoothedRef.current = null;
        streakRef.current = 0;
        phaseRef.current = phase;
      }

      if (phase === "done") {
        finishedRef.current = true;
        setView((v) => ({ ...v, phase: "done" }));
        onFinish(mirrorResult(samplesRef.current));
        return;
      }

      const leading = leaderFor(phase) === role;
      const mirroring = isMirroring(phase, role);
      const pose = poseRef.current;

      // Leader streams their angles; the mirror scores against them.
      if (leading && pose && t - lastBroadcastRef.current >= BROADCAST_MS) {
        lastBroadcastRef.current = t;
        sendGameEvent({ angles: packAngles(pose.angles) });
      }

      let score = smoothedRef.current ?? 0;
      if (mirroring && pose && leaderAnglesRef.current) {
        const raw = mirrorSimilarity(leaderAnglesRef.current, pose.angles);
        // Smoothed so MediaPipe jitter doesn't make the number flicker.
        smoothedRef.current = smoothValue(smoothedRef.current, raw, 0.25);
        score = smoothedRef.current;
        if (t - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
          lastSampleRef.current = t;
          samplesRef.current.push(score);
          streakRef.current =
            score >= STREAK_THRESHOLD ? streakRef.current + 1 : 0;
        }
      }

      const boundary =
        phase === "round1"
          ? schedule.swapAt
          : phase === "round2"
            ? schedule.endAt
            : phase === "intro"
              ? schedule.round1At
              : schedule.round2At;

      setView({
        phase,
        score,
        streak: streakRef.current,
        secondsLeft: Math.max(0, Math.ceil((boundary - t) / 1000)),
      });
    };

    const timer = setInterval(tick, 80);
    tick();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, role, now, onFinish]);

  const leading = leaderFor(view.phase) === role;
  const mirroring = isMirroring(view.phase, role);

  return (
    <PhysicalGameFrame
      vision={tracking.vision}
      landmarksRef={tracking.vision.landmarksRef}
      onRequestSkip={requestSkip}
      skipPending={skipPending}
      overlay={
        <>
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <div className="rounded-2xl bg-bg/80 px-5 py-2 text-center">
              {view.phase === "intro" && (
                <p className="font-display text-lg font-bold text-ink">
                  {role === "player1" ? "You lead first" : `${partnerName} leads first`}
                </p>
              )}
              {view.phase === "swap" && (
                <p className="font-display text-lg font-bold text-peach">
                  Swap! {role === "player2" ? "Your turn to lead" : "Time to mirror"}
                </p>
              )}
              {leading && (
                <p className="font-display text-xl font-extrabold text-gradient-duo">
                  LEAD — strike some poses
                </p>
              )}
              {mirroring && (
                <p className="font-display text-xl font-extrabold text-ink">
                  MIRROR {partnerName}
                </p>
              )}
              {view.phase !== "done" && (
                <p className="text-xs text-muted">{view.secondsLeft}s</p>
              )}
              {view.phase === "done" && (
                <p className="animate-pulse-soft text-sm text-muted">
                  {partnerResult ? "Scoring…" : `Waiting for ${partnerName}…`}
                </p>
              )}
            </div>
          </div>

          {mirroring && (
            <div className="absolute inset-x-0 bottom-4 flex flex-col items-center">
              <motion.p
                animate={{ scale: view.score >= STREAK_THRESHOLD ? [1, 1.05, 1] : 1 }}
                transition={{ duration: 0.4 }}
                className="font-display text-6xl font-extrabold text-gradient-duo"
              >
                {view.score.toFixed(0)}%
              </motion.p>
              <p className="text-sm text-muted">{mirrorFeedback(view.score)}</p>
              {view.streak > 6 && (
                <p className="mt-1 font-display text-xs font-bold text-peach">
                  🔥 {Math.round((view.streak * SAMPLE_INTERVAL_MS) / 100) / 10}s streak
                </p>
              )}
            </div>
          )}

          {leading && (
            <div className="absolute inset-x-0 bottom-4 text-center">
              <p className="text-sm text-muted">
                {partnerName} is copying you — make it hard
              </p>
            </div>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">{playerName}</span>
        <span className="text-xs text-muted">
          {view.phase === "round1" || view.phase === "round2"
            ? `${leading ? "Leading" : "Mirroring"} · scored on your mirror turn`
            : "Mirror Me"}
        </span>
        <span className="font-display font-bold text-violet-soft">{partnerName}</span>
      </div>
    </PhysicalGameFrame>
  );
}
