"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PhysicalGameFrame } from "@/components/vision/PhysicalGameFrame";
import { usePoseTracking } from "@/hooks/usePoseTracking";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  ROUNDS,
  buildSchedule,
  createRounds,
  freezeFeedback,
  freezeResult,
  freezeScore,
  scoreFreezeWindow,
} from "./logic";

type Phase = "calibrating" | "move" | "freeze" | "reveal" | "done";

export function FreezeGame({
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
  const rounds = useMemo(() => createRounds(seed), [seed]);
  const schedule = useMemo(() => buildSchedule(startAt, rounds), [startAt, rounds]);

  const tracking = usePoseTracking();
  const { motionRef, setCalibrating, finishCalibration, baselineRef } = tracking;

  const [view, setView] = useState<{ index: number; phase: Phase }>({
    index: 0,
    phase: "calibrating",
  });
  const [scores, setScores] = useState<number[]>([]);
  const [partnerAvg, setPartnerAvg] = useState<number | null>(null);

  const samplesRef = useRef<number[]>([]);
  const scoresRef = useRef<number[]>([]);
  const phaseRef = useRef<Phase>("calibrating");
  const indexRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.avg === "number") setPartnerAvg(payload.avg);
    });
  }, [onGameEvent]);

  // Calibration runs before the first MOVE.
  useEffect(() => {
    setCalibrating(true);
    return () => setCalibrating(false);
  }, [setCalibrating]);

  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const t = now();

      let index = schedule.findIndex((s) => t < s.endAt);
      let phase: Phase;
      if (t < schedule[0].moveAt) {
        index = 0;
        phase = "calibrating";
      } else if (index === -1) {
        index = ROUNDS - 1;
        phase = "done";
      } else {
        const slot = schedule[index];
        phase =
          t < slot.freezeAt ? "move" : t < slot.revealAt ? "freeze" : "reveal";
      }

      // Sample motion only inside the freeze window.
      if (phase === "freeze") samplesRef.current.push(motionRef.current);

      if (phase !== phaseRef.current || index !== indexRef.current) {
        // Leaving calibration: lock in this player's noise floor.
        if (phaseRef.current === "calibrating" && phase !== "calibrating") {
          finishCalibration();
        }
        // Leaving a freeze window: score it.
        const leavingFreeze = phaseRef.current === "freeze" && phase !== "freeze";
        if (leavingFreeze && scoresRef.current.length === indexRef.current) {
          const excess = scoreFreezeWindow(samplesRef.current, baselineRef.current);
          samplesRef.current = [];
          scoresRef.current = [...scoresRef.current, excess];
          setScores(scoresRef.current);
          soundManager.play(freezeScore(excess) >= 70 ? "correct" : "incorrect");
          const avg =
            scoresRef.current.reduce((a, b) => a + b, 0) / scoresRef.current.length;
          sendGameEvent({ avg: Math.round(freezeScore(avg) * 10) / 10 });
        }
        if (phase === "move" && phaseRef.current !== "move") soundManager.play("go");
        if (phase === "freeze") soundManager.play("false_start");
        phaseRef.current = phase;
        indexRef.current = index;
      }

      if (phase === "done") {
        finishedRef.current = true;
        setView({ index, phase: "done" });
        onFinish(freezeResult(scoresRef.current));
        return;
      }
      setView({ index, phase });
    };

    const timer = setInterval(tick, 60);
    tick();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, now, onFinish]);

  const lastScore =
    scores.length > 0 ? freezeScore(scores[scores.length - 1]) : null;
  const myAverage =
    scores.length > 0
      ? freezeScore(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100;

  return (
    <PhysicalGameFrame
      vision={tracking.vision}
      landmarksRef={tracking.vision.landmarksRef}
      onRequestSkip={requestSkip}
      skipPending={skipPending}
      overlay={
        <div className="absolute inset-0 flex items-center justify-center">
          {view.phase === "calibrating" && (
            <Pill>
              <p className="font-display text-xl font-bold text-ink">
                Hold still…
              </p>
              <p className="text-xs text-muted">measuring your camera</p>
            </Pill>
          )}
          {view.phase === "move" && (
            <motion.p
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 0.6 }}
              className="font-display text-7xl font-extrabold text-gradient-duo glow-rose"
            >
              MOVE!
            </motion.p>
          )}
          {view.phase === "freeze" && (
            <motion.p
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-display text-7xl font-extrabold text-ink drop-shadow-lg"
            >
              FREEZE!
            </motion.p>
          )}
          {view.phase === "reveal" && lastScore !== null && (
            <div className="flex flex-col items-center">
              <p className="font-display text-6xl font-extrabold text-gradient-duo">
                {lastScore.toFixed(0)}
              </p>
              <p className="mt-2 text-sm text-muted">{freezeFeedback(lastScore)}</p>
            </div>
          )}
          {view.phase === "done" && (
            <Pill>
              <p className="animate-pulse-soft text-sm text-muted">
                {partnerResult ? "Scoring…" : `Waiting for ${partnerName}…`}
              </p>
            </Pill>
          )}
        </div>
      }
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">
          {playerName} · {myAverage.toFixed(0)}
        </span>
        <span className="text-xs text-muted">
          Round {Math.min(view.index + 1, ROUNDS)} of {ROUNDS}
        </span>
        <span className="font-display font-bold text-violet-soft">
          {partnerResult
            ? partnerResult.normalizedScore.toFixed(0)
            : partnerAvg !== null
              ? partnerAvg.toFixed(0)
              : "—"}{" "}
          · {partnerName}
        </span>
      </div>
    </PhysicalGameFrame>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-bg/80 px-5 py-3 text-center">{children}</div>
  );
}
