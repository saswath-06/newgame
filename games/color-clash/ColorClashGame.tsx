"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  COLOR_HEX,
  COLOR_KEYS,
  INTERSTITIAL_MS,
  PROMPT_COUNT,
  PROMPT_TIMEOUT_MS,
  colorClashResult,
  createPrompts,
  isCorrect,
  type ColorAnswer,
  type ColorKey,
} from "./logic";

type Feedback = "correct" | "wrong" | null;

export function ColorClashGame({
  seed,
  playerName,
  partnerName,
  now,
  modifiers,
  sendGameEvent,
  onGameEvent,
  onFinish,
  partnerResult,
}: GameProps) {
  const prompts = useMemo(() => createPrompts(seed), [seed]);
  const timeoutMs = modifiers.includes("faster_timer") ? 1400 : PROMPT_TIMEOUT_MS;
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [partnerProgress, setPartnerProgress] = useState({ answered: 0, correct: 0 });

  const answersRef = useRef<ColorAnswer[]>([]);
  const promptShownAtRef = useRef(0);
  const finishedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.answered === "number") {
        setPartnerProgress({
          answered: payload.answered,
          correct: typeof payload.correct === "number" ? payload.correct : 0,
        });
      }
    });
  }, [onGameEvent]);

  const submitAnswer = (choice: ColorKey | null) => {
    if (finishedRef.current || feedback !== null) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const answer: ColorAnswer = {
      choice,
      reactionMs: Math.max(0, now() - promptShownAtRef.current),
    };
    answersRef.current.push(answer);
    const prompt = prompts[index];
    const good = isCorrect(prompt, answer);
    setFeedback(good ? "correct" : "wrong");
    soundManager.play(good ? "correct" : "incorrect");
    const newCorrect = correctCount + (good ? 1 : 0);
    setCorrectCount(newCorrect);
    sendGameEvent({ answered: answersRef.current.length, correct: newCorrect });

    setTimeout(() => {
      setFeedback(null);
      if (answersRef.current.length >= PROMPT_COUNT) {
        finishedRef.current = true;
        setDone(true);
        onFinish(colorClashResult(prompts, answersRef.current));
      } else {
        setIndex((i) => i + 1);
      }
    }, INTERSTITIAL_MS);
  };

  // Arm the timeout for each prompt; timeouts count as wrong answers.
  useEffect(() => {
    if (done || feedback !== null) return;
    promptShownAtRef.current = now();
    timeoutRef.current = setTimeout(() => submitAnswer(null), timeoutMs);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, done, feedback]);

  // Keys 1-4 answer in button order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= COLOR_KEYS.length) submitAnswer(COLOR_KEYS[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, feedback, done]);

  const prompt = prompts[Math.min(index, prompts.length - 1)];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-4">
      <div className="flex w-full max-w-md items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">
          {playerName} · {correctCount}✓
        </span>
        <span className="text-muted">
          {Math.min(index + 1, PROMPT_COUNT)}/{PROMPT_COUNT}
        </span>
        <span className="font-display font-bold text-violet-soft">
          {partnerName} · {partnerResult ? "done" : `${partnerProgress.correct}✓`}
        </span>
      </div>

      {!done ? (
        <>
          <p className="text-center text-xs uppercase tracking-[0.3em] text-muted">
            Tap the ink color — not the word
          </p>
          <motion.p
            key={index}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.12 }}
            className="font-display text-6xl font-extrabold uppercase sm:text-7xl"
            style={{ color: COLOR_HEX[prompt.ink] }}
          >
            {prompt.word}
          </motion.p>

          <div
            className={`grid w-full max-w-md grid-cols-4 gap-2 transition-opacity sm:gap-3 ${
              feedback ? "opacity-60" : ""
            }`}
          >
            {COLOR_KEYS.map((key, i) => (
              <button
                key={key}
                onClick={() => submitAnswer(key)}
                className="cursor-pointer rounded-2xl border-2 border-transparent px-2 py-5 font-display text-xs font-bold uppercase tracking-wider text-bg transition-transform hover:scale-[1.04] active:scale-95"
                style={{ backgroundColor: COLOR_HEX[key] }}
              >
                {key}
                <span className="mt-0.5 block text-[10px] font-medium opacity-70">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>

          <p
            className={`h-6 font-display text-lg font-bold ${
              feedback === "correct"
                ? "text-go"
                : feedback === "wrong"
                  ? "text-danger"
                  : "text-transparent"
            }`}
          >
            {feedback === "correct" ? "NICE" : feedback === "wrong" ? "NOPE" : "."}
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
