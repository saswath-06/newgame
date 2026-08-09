"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  BUTTON_STYLES,
  MAX_LEVEL,
  SHOW_GAP_MS,
  SHOW_MS,
  createSequence,
  inputWindowMs,
  sequenceResult,
} from "./logic";

type Phase = "show" | "input" | "level_up" | "done";

export function SequenceShowdownGame({
  seed,
  playerName,
  partnerName,
  sendGameEvent,
  onGameEvent,
  onFinish,
  partnerResult,
}: GameProps) {
  const sequence = useMemo(() => createSequence(seed), [seed]);
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<Phase>("show");
  const [litButton, setLitButton] = useState<number | null>(null);
  const [inputPos, setInputPos] = useState(0);
  const [partnerLevel, setPartnerLevel] = useState(0);

  const finishedRef = useRef(false);
  const inputStartRef = useRef(0);
  const inputTimesRef = useRef<number[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.level === "number") setPartnerLevel(payload.level);
    });
  }, [onGameEvent]);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  };

  const finish = (completedLevel: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimers();
    setPhase("done");
    const times = inputTimesRef.current;
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    onFinish(sequenceResult(completedLevel, avg));
  };

  // Play back the sequence for the current level, then open input.
  useEffect(() => {
    if (phase !== "show" || finishedRef.current) return;
    clearTimers();
    for (let i = 0; i < level; i++) {
      const t1 = setTimeout(() => {
        setLitButton(sequence[i]);
        soundManager.play("countdown");
      }, 400 + i * (SHOW_MS + SHOW_GAP_MS));
      const t2 = setTimeout(
        () => setLitButton(null),
        400 + i * (SHOW_MS + SHOW_GAP_MS) + SHOW_MS,
      );
      timersRef.current.push(t1, t2);
    }
    const openInput = setTimeout(() => {
      setPhase("input");
      setInputPos(0);
      inputStartRef.current = Date.now();
      // Silence within the window fails the level.
      const deadline = setTimeout(() => finish(level - 1), inputWindowMs(level));
      timersRef.current.push(deadline);
    }, 400 + level * (SHOW_MS + SHOW_GAP_MS) + 200);
    timersRef.current.push(openInput);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, level]);

  const press = (button: number, pressedAt: number) => {
    if (phase !== "input" || finishedRef.current) return;
    setLitButton(button);
    setTimeout(() => setLitButton(null), 180);

    if (button !== sequence[inputPos]) {
      soundManager.play("incorrect");
      finish(level - 1);
      return;
    }
    soundManager.play("correct");
    inputTimesRef.current.push(
      (pressedAt - inputStartRef.current) / (inputPos + 1),
    );
    const nextPos = inputPos + 1;
    if (nextPos < level) {
      setInputPos(nextPos);
      return;
    }
    // Level cleared.
    clearTimers();
    sendGameEvent({ level });
    if (level >= MAX_LEVEL) {
      soundManager.play("point");
      finish(MAX_LEVEL);
      return;
    }
    setPhase("level_up");
    soundManager.play("point");
    const t = setTimeout(() => {
      setLevel(level + 1);
      setPhase("show");
    }, 800);
    timersRef.current.push(t);
  };

  useEffect(() => clearTimers, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
      <div className="flex w-full max-w-md items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">
          {playerName} · L{phase === "done" ? "—" : level}
        </span>
        <span className="text-muted">
          {phase === "show" && "WATCH…"}
          {phase === "input" && `REPEAT (${inputPos}/${level})`}
          {phase === "level_up" && "NICE!"}
          {phase === "done" && ""}
        </span>
        <span className="font-display font-bold text-violet-soft">
          {partnerName} · {partnerResult ? "done" : `L${partnerLevel}`}
        </span>
      </div>

      {phase !== "done" ? (
        <>
          <div className="grid w-full max-w-xs grid-cols-2 gap-3 sm:max-w-sm sm:gap-4">
            {BUTTON_STYLES.map((style, i) => (
              <motion.button
                key={i}
                onClick={() => press(i, Date.now())}
                whileTap={{ scale: 0.93 }}
                disabled={phase !== "input"}
                aria-label={`Button ${i + 1}`}
                className="aspect-square cursor-pointer rounded-3xl border-2 transition-all disabled:cursor-default"
                style={{
                  backgroundColor: litButton === i ? style.color : `${style.color}22`,
                  borderColor: litButton === i ? style.color : `${style.color}55`,
                  boxShadow: litButton === i ? `0 0 32px ${style.color}88` : "none",
                }}
              />
            ))}
          </div>
          <p className="text-xs text-muted">
            {phase === "input"
              ? "Repeat the pattern"
              : `Round of ${level} — watch closely`}
          </p>
        </>
      ) : (
        <p className="animate-pulse-soft text-sm text-muted">
          {partnerResult ? "Scoring…" : `Waiting for ${partnerName} to finish…`}
        </p>
      )}
    </div>
  );
}
