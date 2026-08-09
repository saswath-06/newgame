"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PhysicalGameFrame } from "@/components/vision/PhysicalGameFrame";
import { useVision } from "@/hooks/useVision";
import { GESTURE_INFO, GestureStabilizer, recognizeGesture } from "@/lib/vision/gestures";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import type { GestureName } from "@/types/vision";
import { TARGET_COUNT, TIME_CAP_MS, createSequence, handSignResult } from "./logic";

export function HandSignSprintGame({
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
  const sequence = useMemo(() => createSequence(seed), [seed]);

  const [index, setIndex] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const [progress, setProgress] = useState(0);
  const [partnerIndex, setPartnerIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);

  const indexRef = useRef(0);
  const mistakesRef = useRef(0);
  const finishedRef = useRef(false);
  const stabilizerRef = useRef(new GestureStabilizer(4, 0.7));
  // Wrong gestures only count once until the hand changes shape.
  const lastPenalizedRef = useRef<GestureName | null>(null);

  const vision = useVision("hand", true, (landmarks) => {
    if (finishedRef.current) return;
    const reading = recognizeGesture(landmarks);
    const confirmed = stabilizerRef.current.push(reading);
    setProgress(stabilizerRef.current.progress);
    if (!confirmed) return;

    const target = sequence[indexRef.current];
    if (confirmed === target) {
      lastPenalizedRef.current = null;
      stabilizerRef.current.reset();
      indexRef.current += 1;
      setIndex(indexRef.current);
      setFlash("hit");
      soundManager.play("correct");
      sendGameEvent({ at: indexRef.current });
      setTimeout(() => setFlash(null), 300);
    } else if (confirmed !== lastPenalizedRef.current) {
      lastPenalizedRef.current = confirmed;
      mistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      setFlash("miss");
      soundManager.play("incorrect");
      setTimeout(() => setFlash(null), 300);
    }
  });

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.at === "number") setPartnerIndex(payload.at);
    });
  }, [onGameEvent]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (finishedRef.current) return;
      const t = now() - startAt;
      setElapsed(Math.max(0, t));
      const complete = indexRef.current >= TARGET_COUNT;
      if (complete || t >= TIME_CAP_MS) {
        finishedRef.current = true;
        setDone(true);
        if (complete) soundManager.play("point");
        onFinish(
          handSignResult(indexRef.current, Math.max(0, t), mistakesRef.current),
        );
      }
    }, 120);
    return () => clearInterval(timer);
  }, [now, startAt, onFinish]);

  const target = sequence[Math.min(index, TARGET_COUNT - 1)];
  const info = GESTURE_INFO[target];
  const remaining = Math.max(0, (TIME_CAP_MS - elapsed) / 1000);

  return (
    <PhysicalGameFrame
      vision={vision}
      landmarksRef={vision.landmarksRef}
      mode="hand"
      onRequestSkip={requestSkip}
      skipPending={skipPending}
      overlay={
        <>
          <div className="absolute inset-x-0 top-4 flex flex-col items-center">
            {!done ? (
              <motion.div
                key={index}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`rounded-3xl px-8 py-4 text-center ${
                  flash === "hit"
                    ? "bg-go/25"
                    : flash === "miss"
                      ? "bg-danger/25"
                      : "bg-bg/80"
                }`}
              >
                <p className="text-7xl leading-none">{info.emoji}</p>
                <p className="mt-2 font-display text-sm font-bold text-ink">
                  {info.label}
                </p>
              </motion.div>
            ) : (
              <div className="rounded-2xl bg-bg/80 px-5 py-3">
                <p className="animate-pulse-soft text-sm text-muted">
                  {partnerResult ? "Scoring…" : `Waiting for ${partnerName}…`}
                </p>
              </div>
            )}
          </div>

          {/* Confidence ring: fills while a gesture is being confirmed. */}
          {!done && (
            <div className="absolute inset-x-0 bottom-4 mx-auto w-48">
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose to-violet transition-[width] duration-75"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted">
                hold the sign
              </p>
            </div>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">
          {playerName} · {index}/{TARGET_COUNT}
        </span>
        <span className="text-xs text-muted">
          {remaining.toFixed(0)}s · {mistakes} slips
        </span>
        <span className="font-display font-bold text-violet-soft">
          {partnerResult ? TARGET_COUNT : partnerIndex}/{TARGET_COUNT} · {partnerName}
        </span>
      </div>
      <div className="flex gap-1">
        {sequence.map((g, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < index ? "bg-go" : i === index ? "bg-rose" : "bg-raised"
            }`}
          />
        ))}
      </div>
    </PhysicalGameFrame>
  );
}
