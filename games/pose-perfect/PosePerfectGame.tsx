"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PhysicalGameFrame } from "@/components/vision/PhysicalGameFrame";
import { useVision } from "@/hooks/useVision";
import { comparePoses, normalizePose } from "@/lib/vision/math";
import { similarityFeedback } from "@/lib/vision/poses";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  POSES_PER_ROUND,
  buildSchedule,
  posePerfectResult,
  selectPoses,
} from "./logic";

type Phase = "preview" | "countdown" | "capture" | "reveal" | "done";

export function PosePerfectGame({
  seed,
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
  const poses = useMemo(() => selectPoses(seed), [seed]);
  const schedule = useMemo(() => buildSchedule(startAt), [startAt]);

  const [view, setView] = useState<{
    index: number;
    phase: Phase;
    countdown: number;
    live: number;
  }>({ index: 0, phase: "preview", countdown: 3, live: 0 });
  const [scores, setScores] = useState<number[]>([]);
  const [partnerScore, setPartnerScore] = useState<number | null>(null);

  // Best similarity seen during the current capture window.
  const bestRef = useRef(0);
  const scoresRef = useRef<number[]>([]);
  const liveRef = useRef(0);
  const phaseRef = useRef<Phase>("preview");
  const indexRef = useRef(0);
  const finishedRef = useRef(false);
  const soundKeyRef = useRef("");

  const vision = useVision("pose", true, (landmarks) => {
    if (phaseRef.current !== "capture" || !landmarks) return;
    const normalized = normalizePose(landmarks);
    if (!normalized) return;
    const template = poses[indexRef.current];
    if (!template) return;
    const similarity = comparePoses(template.angles, normalized.angles, template.skip);
    liveRef.current = similarity;
    if (similarity > bestRef.current) bestRef.current = similarity;
  });

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.avg === "number") setPartnerScore(payload.avg);
    });
  }, [onGameEvent]);

  // The clock drives the whole game; both clients share the schedule.
  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const t = now();

      let index = schedule.findIndex((s) => t < s.endAt);
      let phase: Phase;
      if (index === -1) {
        index = POSES_PER_ROUND - 1;
        phase = "done";
      } else {
        const slot = schedule[index];
        phase =
          t < slot.countdownAt
            ? "preview"
            : t < slot.captureAt
              ? "countdown"
              : t < slot.revealAt
                ? "capture"
                : "reveal";
      }

      // Commit the captured score when a capture window closes.
      if (index !== indexRef.current || phase !== phaseRef.current) {
        const leavingCapture =
          phaseRef.current === "capture" && phase !== "capture";
        if (leavingCapture && scoresRef.current.length === indexRef.current) {
          const captured = bestRef.current;
          scoresRef.current = [...scoresRef.current, captured];
          setScores(scoresRef.current);
          soundManager.play(captured >= 70 ? "correct" : "incorrect");
          sendGameEvent({
            avg:
              Math.round(
                (scoresRef.current.reduce((a, b) => a + b, 0) /
                  scoresRef.current.length) *
                  10,
              ) / 10,
            posed: scoresRef.current.length,
          });
        }
        if (index !== indexRef.current) {
          bestRef.current = 0;
          liveRef.current = 0;
        }
        indexRef.current = index;
        phaseRef.current = phase;
      }

      if (phase === "done") {
        finishedRef.current = true;
        setView((v) => ({ ...v, phase: "done" }));
        onFinish(posePerfectResult(scoresRef.current));
        return;
      }

      const slot = schedule[index];
      const countdown = Math.max(
        1,
        Math.ceil((slot.captureAt - t) / 1000),
      );

      const soundKey = `${index}:${phase}`;
      if (soundKey !== soundKeyRef.current) {
        soundKeyRef.current = soundKey;
        if (phase === "capture") soundManager.play("go");
      }

      setView({ index, phase, countdown, live: liveRef.current });
    };

    const timer = setInterval(tick, 100);
    tick();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, now, onFinish]);

  const template = poses[view.index];
  const myAverage =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const lastScore = scores[scores.length - 1];

  return (
    <PhysicalGameFrame
      vision={vision}
      landmarksRef={vision.landmarksRef}
      onRequestSkip={requestSkip}
      skipPending={skipPending}
      overlay={
        <PoseOverlay
          phase={view.phase}
          countdown={view.countdown}
          live={view.live}
          lastScore={lastScore}
          partnerName={partnerName}
          partnerResult={partnerResult}
        />
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-ink">
            {template ? `${template.emoji} ${template.name}` : "Pose Perfect"}
          </p>
          <p className="truncate text-xs text-muted">
            {template?.hint ?? ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-right">
          <div>
            <p className="font-display text-lg font-bold text-rose">
              {myAverage.toFixed(0)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {playerName}
            </p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-violet-soft">
              {partnerResult
                ? partnerResult.normalizedScore.toFixed(0)
                : partnerScore !== null
                  ? partnerScore.toFixed(0)
                  : "—"}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {partnerName}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5">
        {Array.from({ length: POSES_PER_ROUND }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < scores.length
                ? scores[i] >= 70
                  ? "bg-go"
                  : "bg-peach"
                : i === view.index
                  ? "bg-rose"
                  : "bg-raised"
            }`}
          />
        ))}
      </div>
    </PhysicalGameFrame>
  );
}

function PoseOverlay({
  phase,
  countdown,
  live,
  lastScore,
  partnerName,
  partnerResult,
}: {
  phase: Phase;
  countdown: number;
  live: number;
  lastScore: number | undefined;
  partnerName: string;
  partnerResult: GameProps["partnerResult"];
}) {
  if (phase === "preview") {
    return (
      <Banner>
        <p className="font-display text-xl font-bold text-ink">Get into position</p>
      </Banner>
    );
  }
  if (phase === "countdown") {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.p
          key={countdown}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-display text-8xl font-extrabold text-ink drop-shadow-lg"
        >
          {countdown}
        </motion.p>
      </div>
    );
  }
  if (phase === "capture") {
    return (
      <>
        <Banner>
          <p className="font-display text-3xl font-extrabold text-gradient-duo glow-rose">
            POSE!
          </p>
        </Banner>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-bg/80 px-4 py-1.5">
          <span className="font-display text-2xl font-bold text-ink">
            {live.toFixed(0)}
          </span>
          <span className="ml-1 text-xs text-muted">live match</span>
        </div>
      </>
    );
  }
  if (phase === "reveal" && lastScore !== undefined) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/60">
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-display text-7xl font-extrabold text-gradient-duo"
        >
          {lastScore.toFixed(0)}
        </motion.p>
        <p className="mt-2 text-sm text-muted">{similarityFeedback(lastScore)}</p>
      </div>
    );
  }
  if (phase === "done") {
    return (
      <Banner>
        <p className="animate-pulse-soft text-sm text-muted">
          {partnerResult ? "Scoring…" : `Waiting for ${partnerName}…`}
        </p>
      </Banner>
    );
  }
  return null;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-4 flex justify-center">
      <div className="rounded-full bg-bg/80 px-5 py-2 text-center">{children}</div>
    </div>
  );
}
