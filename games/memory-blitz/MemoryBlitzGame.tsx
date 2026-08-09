"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  MISMATCH_REVEAL_MS,
  PAIR_COUNT,
  TIME_CAP_MS,
  createBoard,
  memoryResult,
} from "./logic";

export function MemoryBlitzGame({
  seed,
  playerName,
  partnerName,
  startAt,
  now,
  sendGameEvent,
  onGameEvent,
  onFinish,
  partnerResult,
}: GameProps) {
  const board = useMemo(() => createBoard(seed), [seed]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [done, setDone] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [partnerProgress, setPartnerProgress] = useState({ matched: 0, mistakes: 0 });
  const lockRef = useRef(false);
  const finishedRef = useRef(false);
  const statsRef = useRef({ matched: 0, mistakes: 0 });

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.matched === "number") {
        setPartnerProgress({
          matched: payload.matched,
          mistakes: typeof payload.mistakes === "number" ? payload.mistakes : 0,
        });
      }
    });
  }, [onGameEvent]);

  // Clock + time cap.
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = now() - startAt;
      setElapsedSec(Math.max(0, Math.floor(elapsed / 1000)));
      if (elapsed >= TIME_CAP_MS && !finishedRef.current) {
        finishedRef.current = true;
        setDone(true);
        const { matched: m, mistakes: err } = statsRef.current;
        onFinish(memoryResult(m, TIME_CAP_MS, err));
      }
    }, 250);
    return () => clearInterval(timer);
  }, [now, startAt, onFinish]);

  const flipCard = (id: number) => {
    if (finishedRef.current || lockRef.current) return;
    const card = board[id];
    if (matched.has(card.emoji) || flipped.includes(id)) return;
    soundManager.play("click");

    if (flipped.length === 0) {
      setFlipped([id]);
      return;
    }
    const firstId = flipped[0];
    const first = board[firstId];
    setFlipped([firstId, id]);

    if (first.emoji === card.emoji) {
      const nextMatched = new Set(matched).add(card.emoji);
      statsRef.current.matched = nextMatched.size;
      soundManager.play("correct");
      setMatched(nextMatched);
      setFlipped([]);
      sendGameEvent({ matched: nextMatched.size, mistakes: statsRef.current.mistakes });
      if (nextMatched.size >= PAIR_COUNT && !finishedRef.current) {
        finishedRef.current = true;
        setDone(true);
        const timeMs = now() - startAt;
        soundManager.play("point");
        onFinish(memoryResult(PAIR_COUNT, timeMs, statsRef.current.mistakes));
      }
    } else {
      lockRef.current = true;
      statsRef.current.mistakes += 1;
      setMistakes(statsRef.current.mistakes);
      soundManager.play("incorrect");
      sendGameEvent({ matched: matched.size, mistakes: statsRef.current.mistakes });
      setTimeout(() => {
        lockRef.current = false;
        setFlipped([]);
      }, MISMATCH_REVEAL_MS);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <div className="flex w-full max-w-md items-center justify-between text-sm">
        <span className="font-display font-bold text-rose">
          {playerName} · {matched.size}/{PAIR_COUNT}
        </span>
        <span className="text-muted">
          {elapsedSec}s · {mistakes} misses
        </span>
      </div>

      <div className="grid w-full max-w-md grid-cols-4 gap-2 sm:gap-3">
        {board.map((card) => {
          const isMatched = matched.has(card.emoji);
          const isUp = isMatched || flipped.includes(card.id);
          return (
            <motion.button
              key={card.id}
              onClick={() => flipCard(card.id)}
              whileTap={{ scale: 0.94 }}
              disabled={done}
              aria-label={isUp ? card.emoji : "Hidden card"}
              className={`aspect-square cursor-pointer rounded-2xl border text-3xl transition-colors sm:text-4xl ${
                isMatched
                  ? "border-go/40 bg-go/10"
                  : isUp
                    ? "border-rose/40 bg-raised"
                    : "border-edge bg-raised/70 hover:border-violet/40"
              }`}
            >
              <motion.span
                initial={false}
                animate={{ rotateY: isUp ? 0 : 180, opacity: isUp ? 1 : 0 }}
                transition={{ duration: 0.18 }}
                className="inline-block"
              >
                {isUp ? card.emoji : "♥"}
              </motion.span>
            </motion.button>
          );
        })}
      </div>

      {/* Partner progress — pace only, never their cards. */}
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-display font-bold text-violet-soft">{partnerName}</span>
          <span>
            {partnerResult
              ? "finished!"
              : `${partnerProgress.matched}/${PAIR_COUNT} · ${partnerProgress.mistakes} misses`}
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet to-rose"
            animate={{
              width: `${((partnerResult ? PAIR_COUNT : partnerProgress.matched) / PAIR_COUNT) * 100}%`,
            }}
          />
        </div>
      </div>

      {done && (
        <p className="animate-pulse-soft text-sm text-muted">
          {partnerResult ? "Scoring…" : `Waiting for ${partnerName} to finish…`}
        </p>
      )}
    </div>
  );
}
