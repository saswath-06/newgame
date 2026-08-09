"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PhysicalGameFrame } from "@/components/vision/PhysicalGameFrame";
import { usePoseTracking } from "@/hooks/usePoseTracking";
import { comparePoses } from "@/lib/vision/math";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  JUDGEMENT_COPY,
  TIMING_WINDOW_MS,
  beatTimes,
  endTime,
  judgeBeat,
  moveSyncResult,
  selectChoreography,
  stepTemplates,
  type Judgement,
} from "./logic";

export function MoveSyncGame({
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
  const choreo = useMemo(() => selectChoreography(seed), [seed]);
  const steps = useMemo(() => stepTemplates(choreo), [choreo]);
  const beats = useMemo(() => beatTimes(startAt, steps.length), [startAt, steps.length]);
  const finishAt = useMemo(() => endTime(startAt, steps.length), [startAt, steps.length]);

  const tracking = usePoseTracking();
  const { poseRef } = tracking;

  const [view, setView] = useState<{
    beat: number;
    live: number;
    judgement: Judgement | null;
    countdown: number;
  }>({ beat: 0, live: 0, judgement: null, countdown: 0 });
  const [judgements, setJudgements] = useState<Judgement[]>([]);
  const [partnerScore, setPartnerScore] = useState<number | null>(null);

  const judgementsRef = useRef<Judgement[]>([]);
  // Best similarity seen in the current beat's window, and when it peaked.
  const bestRef = useRef(0);
  const bestAtRef = useRef(0);
  const beatRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.score === "number") setPartnerScore(payload.score);
    });
  }, [onGameEvent]);

  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const t = now();
      const beat = beatRef.current;

      if (beat < beats.length) {
        const beatAt = beats[beat];
        const template = steps[beat];
        const pose = poseRef.current;

        // Sample similarity inside this beat's timing window.
        if (pose && template && Math.abs(t - beatAt) <= TIMING_WINDOW_MS) {
          const similarity = comparePoses(template.angles, pose.angles, template.skip);
          if (similarity > bestRef.current) {
            bestRef.current = similarity;
            bestAtRef.current = t;
          }
          setView((v) => ({ ...v, live: similarity }));
        }

        // Window closed — judge it.
        if (t > beatAt + TIMING_WINDOW_MS) {
          const judgement = judgeBeat(bestRef.current, bestAtRef.current - beatAt);
          judgementsRef.current = [...judgementsRef.current, judgement];
          setJudgements(judgementsRef.current);
          soundManager.play(judgement === "miss" ? "incorrect" : "correct");
          const partial = moveSyncResult(judgementsRef.current, steps.length);
          sendGameEvent({ score: partial.normalizedScore });
          bestRef.current = 0;
          bestAtRef.current = 0;
          beatRef.current = beat + 1;
          setView((v) => ({ ...v, beat: beat + 1, judgement, live: 0 }));
          return;
        }
      }

      if (t >= finishAt) {
        finishedRef.current = true;
        onFinish(moveSyncResult(judgementsRef.current, steps.length));
        return;
      }

      const nextBeatAt = beats[Math.min(beat, beats.length - 1)];
      setView((v) => ({
        ...v,
        beat,
        countdown: Math.max(0, (nextBeatAt - t) / 1000),
      }));
    };

    const timer = setInterval(tick, 60);
    tick();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beats, steps, now, finishAt, onFinish]);

  const current = steps[Math.min(view.beat, steps.length - 1)];
  const upcoming = steps[view.beat + 1];
  const running = moveSyncResult(judgements, steps.length);
  const done = view.beat >= steps.length;
  const copy = view.judgement ? JUDGEMENT_COPY[view.judgement] : null;

  return (
    <PhysicalGameFrame
      vision={tracking.vision}
      landmarksRef={tracking.vision.landmarksRef}
      onRequestSkip={requestSkip}
      skipPending={skipPending}
      overlay={
        <>
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <div className="rounded-2xl bg-bg/80 px-6 py-3 text-center">
              {!done ? (
                <>
                  <p className="text-4xl leading-none">{current?.emoji}</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink">
                    {current?.name}
                  </p>
                  <p className="text-xs text-muted">{current?.hint}</p>
                </>
              ) : (
                <p className="animate-pulse-soft text-sm text-muted">
                  {partnerResult ? "Scoring…" : `Waiting for ${partnerName}…`}
                </p>
              )}
            </div>
          </div>

          {/* Beat pulse: shrinks toward the moment you must hit the pose. */}
          {!done && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                animate={{ scale: 1 + view.countdown * 0.5, opacity: 0.25 }}
                transition={{ duration: 0.06 }}
                className="h-24 w-24 rounded-full border-2 border-rose"
              />
            </div>
          )}

          {copy && (
            <motion.p
              key={judgements.length}
              initial={{ scale: 1.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`absolute inset-x-0 top-1/2 text-center font-display text-5xl font-extrabold ${copy.className}`}
            >
              {copy.label}
            </motion.p>
          )}

          {!done && upcoming && (
            <div className="absolute bottom-4 right-4 rounded-xl bg-bg/80 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted">next</p>
              <p className="text-2xl">{upcoming.emoji}</p>
            </div>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">
          {playerName} · {running.normalizedScore.toFixed(0)}
        </span>
        <span className="text-xs text-muted">
          {choreo.name} · {Math.min(view.beat + 1, steps.length)}/{steps.length}
        </span>
        <span className="font-display font-bold text-violet-soft">
          {partnerResult
            ? partnerResult.normalizedScore.toFixed(0)
            : partnerScore !== null
              ? partnerScore.toFixed(0)
              : "—"}{" "}
          · {partnerName}
        </span>
      </div>
      <div className="flex gap-1">
        {steps.map((_, i) => {
          const j = judgements[i];
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                j === "perfect"
                  ? "bg-go"
                  : j === "good"
                    ? "bg-rose"
                    : j === "late"
                      ? "bg-peach"
                      : j === "miss"
                        ? "bg-danger"
                        : i === view.beat
                          ? "bg-violet"
                          : "bg-raised"
              }`}
            />
          );
        })}
      </div>
    </PhysicalGameFrame>
  );
}
