"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PhysicalGameFrame } from "@/components/vision/PhysicalGameFrame";
import { usePoseTracking } from "@/hooks/usePoseTracking";
import { calculateBalanceStability, comparePoses } from "@/lib/vision/math";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  CALIBRATION_MS,
  ENTRY_GRACE_MS,
  LOST_FRAMES,
  MAX_HOLD_MS,
  REVEAL_MS,
  ROUNDS,
  STATE_COPY,
  balanceResult,
  evaluateForm,
  selectPoses,
  type BalanceState,
} from "./logic";

type Phase = "calibrating" | "entering" | "holding" | "reveal" | "done";

export function BalanceBattleGame({
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
  const tracking = usePoseTracking();
  const { poseRef, historyRef, setCalibrating, finishCalibration, baselineRef } =
    tracking;

  const [view, setView] = useState<{
    round: number;
    phase: Phase;
    state: BalanceState;
    holdMs: number;
  }>({ round: 0, phase: "calibrating", state: "waiting", holdMs: 0 });
  const [holds, setHolds] = useState<number[]>([]);
  const [partnerBest, setPartnerBest] = useState<number | null>(null);

  const holdsRef = useRef<number[]>([]);
  const roundRef = useRef(0);
  const phaseRef = useRef<Phase>("calibrating");
  // Wall-clock markers for the current round.
  const roundStartRef = useRef(0);
  const holdStartRef = useRef(0);
  const invalidFramesRef = useRef(0);
  const revealUntilRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.best === "number") setPartnerBest(payload.best);
    });
  }, [onGameEvent]);

  useEffect(() => {
    setCalibrating(true);
    return () => setCalibrating(false);
  }, [setCalibrating]);

  const commitRound = (heldMs: number) => {
    holdsRef.current = [...holdsRef.current, heldMs];
    setHolds(holdsRef.current);
    soundManager.play(heldMs > 4000 ? "correct" : "incorrect");
    sendGameEvent({ best: Math.round(Math.max(...holdsRef.current)) });
  };

  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const t = now();
      const pose = poseRef.current;
      const template = poses[roundRef.current];

      // Calibration window first.
      if (phaseRef.current === "calibrating") {
        if (t >= startAt + CALIBRATION_MS) {
          finishCalibration();
          phaseRef.current = "entering";
          roundStartRef.current = t;
        }
        setView({ round: 0, phase: phaseRef.current, state: "waiting", holdMs: 0 });
        return;
      }

      // Between rounds.
      if (phaseRef.current === "reveal") {
        if (t >= revealUntilRef.current) {
          roundRef.current += 1;
          if (roundRef.current >= ROUNDS) {
            finishedRef.current = true;
            setView((v) => ({ ...v, phase: "done" }));
            onFinish(balanceResult(holdsRef.current));
            return;
          }
          phaseRef.current = "entering";
          roundStartRef.current = t;
          invalidFramesRef.current = 0;
        }
        setView({
          round: roundRef.current,
          phase: "reveal",
          state: "waiting",
          holdMs: holdsRef.current[holdsRef.current.length - 1] ?? 0,
        });
        return;
      }

      const similarity =
        pose && template
          ? comparePoses(template.angles, pose.angles, template.skip)
          : 0;
      const sway = calculateBalanceStability(historyRef.current);
      const state = evaluateForm(similarity, sway, baselineRef.current);

      if (phaseRef.current === "entering") {
        // The clock only starts once they're actually in the pose.
        if (state === "holding" || state === "wobbling") {
          phaseRef.current = "holding";
          holdStartRef.current = t;
          invalidFramesRef.current = 0;
          soundManager.play("go");
        } else if (t - roundStartRef.current > ENTRY_GRACE_MS) {
          // Never got into it — score zero and move on.
          commitRound(0);
          phaseRef.current = "reveal";
          revealUntilRef.current = t + REVEAL_MS;
        }
        setView({
          round: roundRef.current,
          phase: phaseRef.current,
          state,
          holdMs: 0,
        });
        return;
      }

      // Holding.
      const heldMs = t - holdStartRef.current;
      if (state === "lost") invalidFramesRef.current += 1;
      else invalidFramesRef.current = 0;

      const lost = invalidFramesRef.current >= LOST_FRAMES;
      const capped = heldMs >= MAX_HOLD_MS;
      if (lost || capped) {
        commitRound(Math.min(MAX_HOLD_MS, heldMs));
        phaseRef.current = "reveal";
        revealUntilRef.current = t + REVEAL_MS;
        setView({
          round: roundRef.current,
          phase: "reveal",
          state,
          holdMs: Math.min(MAX_HOLD_MS, heldMs),
        });
        return;
      }
      setView({ round: roundRef.current, phase: "holding", state, holdMs: heldMs });
    };

    const timer = setInterval(tick, 100);
    tick();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poses, now, startAt, onFinish]);

  const template = poses[Math.min(view.round, poses.length - 1)];
  const totalHold = holds.reduce((a, b) => a + b, 0);
  const copy = STATE_COPY[view.state];

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
              {view.phase === "calibrating" ? (
                <p className="font-display text-lg font-bold text-ink">
                  Hold still…
                </p>
              ) : (
                <>
                  <p className="font-display text-lg font-bold text-ink">
                    {template?.emoji} {template?.name}
                  </p>
                  <p className="text-xs text-muted">{template?.hint}</p>
                </>
              )}
            </div>
          </div>
          {view.phase !== "calibrating" && (
            <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1">
              <p className={`font-display text-3xl font-extrabold ${copy.className}`}>
                {view.phase === "reveal" ? "ROUND OVER" : copy.label}
              </p>
              <p className="font-display text-5xl font-bold text-ink">
                {(view.holdMs / 1000).toFixed(1)}s
              </p>
            </div>
          )}
          {view.phase === "done" && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/60">
              <p className="animate-pulse-soft text-sm text-muted">
                {partnerResult ? "Scoring…" : `Waiting for ${partnerName}…`}
              </p>
            </div>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">
          {playerName} · {(totalHold / 1000).toFixed(1)}s
        </span>
        <span className="text-xs text-muted">
          Round {Math.min(view.round + 1, ROUNDS)} of {ROUNDS}
        </span>
        <span className="font-display font-bold text-violet-soft">
          {partnerBest !== null ? `${(partnerBest / 1000).toFixed(1)}s best` : "—"} ·{" "}
          {partnerName}
        </span>
      </div>
    </PhysicalGameFrame>
  );
}
