"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  MAX_SUBROUNDS,
  REACTION_TIMEOUT_MS,
  SUBROUNDS_TO_WIN,
  computeStanding,
  createQuickdrawConfig,
  quickdrawResult,
  resolveSubRound,
  type Reaction,
} from "./logic";

const GET_READY_MS = 1000;
const RESULT_MS = 1800;
const TICK_MS = 50;

type SubPhase = "ready" | "waiting" | "go" | "result" | "done";

interface Slot {
  readyAt: number;
  waitAt: number;
  goAt: number;
  resultAt: number;
  endAt: number;
}

interface View {
  sub: number;
  phase: SubPhase;
  mine: Reaction | null;
  theirs: Reaction | null;
  myWins: number;
  theirWins: number;
}

/**
 * Both clients derive the identical sub-round schedule from the shared
 * seed and their synced clock, so WAIT/CLICK flips at the same moment on
 * both screens. Only reaction data crosses the network.
 */
export function QuickdrawGame({
  seed,
  role,
  playerName,
  partnerName,
  startAt,
  now,
  modifiers,
  sendGameEvent,
  onGameEvent,
  onFinish,
  partnerResult,
}: GameProps) {
  const config = useMemo(() => createQuickdrawConfig(seed), [seed]);
  // Hyper Speed modifier: a much less forgiving click window. Both
  // clients share the modifier list, so schedules stay in lockstep.
  const windowMs = modifiers.includes("faster_timer") ? 1100 : REACTION_TIMEOUT_MS;

  const slots = useMemo<Slot[]>(() => {
    const list: Slot[] = [];
    let t = startAt;
    for (const delay of config.delays) {
      const readyAt = t;
      const waitAt = readyAt + GET_READY_MS;
      const goAt = waitAt + delay;
      const resultAt = goAt + windowMs;
      const endAt = resultAt + RESULT_MS;
      list.push({ readyAt, waitAt, goAt, resultAt, endAt });
      t = endAt;
    }
    return list;
  }, [config, startAt, windowMs]);

  const zoneRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<(Reaction | null)[]>(Array(MAX_SUBROUNDS).fill(null));
  const theirsRef = useRef<(Reaction | null)[]>(Array(MAX_SUBROUNDS).fill(null));
  const finishedRef = useRef(false);
  const lastSoundKeyRef = useRef("");

  const [view, setView] = useState<View>({
    sub: 0,
    phase: "ready",
    mine: null,
    theirs: null,
    myWins: 0,
    theirWins: 0,
  });

  // Partner reactions arrive as cumulative arrays — self-healing on loss.
  useEffect(() => {
    return onGameEvent((payload) => {
      const list = payload.reactions;
      if (!Array.isArray(list)) return;
      list.forEach((raw, i) => {
        if (i >= MAX_SUBROUNDS || raw === null || typeof raw !== "object") return;
        const r = raw as { reactionMs?: unknown; falseStart?: unknown };
        theirsRef.current[i] = {
          reactionMs: typeof r.reactionMs === "number" ? r.reactionMs : null,
          falseStart: Boolean(r.falseStart),
        };
      });
    });
  }, [onGameEvent]);

  const shareMine = () => {
    sendGameEvent({
      reactions: mineRef.current.map((r) =>
        r ? { reactionMs: r.reactionMs, falseStart: r.falseStart } : null,
      ),
    });
  };

  const recordReaction = (sub: number, reaction: Reaction) => {
    if (mineRef.current[sub]) return;
    mineRef.current[sub] = reaction;
    shareMine();
  };

  // The clock drives everything.
  useEffect(() => {
    const locate = (t: number): { sub: number; phase: SubPhase; slot: Slot } => {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (t < s.waitAt) return { sub: i, phase: "ready", slot: s };
        if (t < s.goAt) return { sub: i, phase: "waiting", slot: s };
        if (t < s.resultAt) return { sub: i, phase: "go", slot: s };
        if (t < s.endAt) return { sub: i, phase: "result", slot: s };
      }
      const last = slots[slots.length - 1];
      return { sub: slots.length - 1, phase: "done", slot: last };
    };

    const tick = () => {
      if (finishedRef.current) return;
      const t = now();
      const { sub, phase } = locate(t);

      // Entering the result window with no click on record = a miss.
      if ((phase === "result" || phase === "done") && !mineRef.current[sub]) {
        recordReaction(sub, { reactionMs: null, falseStart: false });
      }

      // The duel is decided from fully elapsed sub-rounds only, so both
      // clients settle at the same moment regardless of tick jitter.
      const miss: Reaction = { reactionMs: null, falseStart: false };
      const fullyEnded = slots.reduce((n, s) => (t >= s.endAt ? n + 1 : n), 0);
      const mineArr = mineRef.current.slice(0, fullyEnded).map((r) => r ?? miss);
      const theirsArr = theirsRef.current.slice(0, fullyEnded).map((r) => r ?? miss);
      const standing = computeStanding(
        role === "player1" ? mineArr : theirsArr,
        role === "player1" ? theirsArr : mineArr,
      );

      if (standing.done) {
        finishedRef.current = true;
        setView((v) => ({ ...v, phase: "done" }));
        onFinish(quickdrawResult(mineArr, theirsArr, role));
        return;
      }

      const myWins = role === "player1" ? standing.wins.player1 : standing.wins.player2;
      const theirWins = role === "player1" ? standing.wins.player2 : standing.wins.player1;

      // One sound per phase entry.
      const soundKey = `${sub}:${phase}`;
      if (soundKey !== lastSoundKeyRef.current) {
        lastSoundKeyRef.current = soundKey;
        if (phase === "go") soundManager.play("go");
        if (phase === "ready" && sub > 0) soundManager.play("countdown");
      }

      setView({
        sub,
        phase,
        mine: mineRef.current[sub],
        theirs: theirsRef.current[sub],
        myWins,
        theirWins,
      });
    };

    const timer = setInterval(tick, TICK_MS);
    tick();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, role, now, onFinish]);

  // Click / tap / spacebar all draw.
  useEffect(() => {
    const draw = () => {
      if (finishedRef.current) return;
      const t = now();
      const sub = view.sub;
      const slot = slots[sub];
      if (!slot || mineRef.current[sub]) return;
      if (t >= slot.waitAt && t < slot.goAt) {
        recordReaction(sub, { reactionMs: null, falseStart: true });
        soundManager.play("false_start");
        setView((v) => ({ ...v, mine: mineRef.current[sub] }));
      } else if (t >= slot.goAt && t < slot.resultAt) {
        const ms = Math.round(t - slot.goAt);
        recordReaction(sub, { reactionMs: ms, falseStart: false });
        soundManager.play("point");
        setView((v) => ({ ...v, mine: mineRef.current[sub] }));
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        draw();
      }
    };
    const el = zoneRef.current;
    el?.addEventListener("pointerdown", draw);
    window.addEventListener("keydown", onKey);
    return () => {
      el?.removeEventListener("pointerdown", draw);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.sub, slots, now]);

  const subWinner =
    view.mine && view.theirs
      ? resolveSubRound(
          role === "player1" ? view.mine : view.theirs,
          role === "player1" ? view.theirs : view.mine,
        )
      : null;
  const iWonSub = subWinner === role;
  const subTie = view.mine && view.theirs && subWinner === null;

  return (
    <div
      ref={zoneRef}
      className={`relative flex h-full w-full cursor-pointer select-none flex-col items-center justify-center transition-colors duration-100 ${
        view.phase === "go"
          ? "bg-gradient-to-br from-rose/80 to-violet/80"
          : view.mine?.falseStart && view.phase !== "ready"
            ? "bg-danger/20"
            : "bg-transparent"
      }`}
      role="button"
      aria-label="Quickdraw play area — click when you see CLICK!"
      tabIndex={0}
    >
      <div className="absolute top-5 flex items-center gap-6 font-display text-sm font-bold">
        <span className="text-rose">
          {playerName} {pips(view.myWins)}
        </span>
        <span className="text-xs font-medium text-muted">first to {SUBROUNDS_TO_WIN}</span>
        <span className="text-violet-soft">
          {pips(view.theirWins)} {partnerName}
        </span>
      </div>

      {view.phase === "ready" && (
        <Center>
          <p className="font-display text-sm uppercase tracking-[0.3em] text-muted">
            Duel {view.sub + 1}
          </p>
          <p className="mt-3 font-display text-4xl font-extrabold text-ink">
            Get ready…
          </p>
        </Center>
      )}

      {view.phase === "waiting" && (
        <Center>
          {view.mine?.falseStart ? (
            <>
              <p className="font-display text-6xl font-extrabold text-danger">
                TOO EARLY!
              </p>
              <p className="mt-3 text-sm text-muted">That one&apos;s a scratch.</p>
            </>
          ) : (
            <>
              <p className="animate-pulse-soft font-display text-6xl font-extrabold tracking-widest text-ink/80">
                WAIT…
              </p>
              <p className="mt-4 text-sm text-muted">
                Click / tap / spacebar the instant you see the signal
              </p>
            </>
          )}
        </Center>
      )}

      {view.phase === "go" && (
        <Center>
          {view.mine && !view.mine.falseStart ? (
            <>
              <p className="font-display text-7xl font-extrabold text-ink">
                {view.mine.reactionMs} ms
              </p>
              <p className="mt-3 animate-pulse-soft text-sm text-ink/80">
                waiting for {partnerName}…
              </p>
            </>
          ) : view.mine?.falseStart ? (
            <p className="font-display text-6xl font-extrabold text-danger">
              TOO EARLY!
            </p>
          ) : (
            <motion.p
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="font-display text-8xl font-extrabold text-ink glow-rose"
            >
              CLICK!
            </motion.p>
          )}
        </Center>
      )}

      {view.phase === "result" && (
        <Center>
          <p className="font-display text-2xl font-bold text-ink">
            {subTie
              ? "Dead heat!"
              : iWonSub
                ? "You take it! ⚡"
                : subWinner
                  ? `${partnerName} takes it`
                  : "…"}
          </p>
          <div className="mt-5 flex items-center gap-8 font-display text-lg">
            <span className="text-rose">{fmtReaction(view.mine)}</span>
            <span className="text-xs text-muted">vs</span>
            <span className="text-violet-soft">{fmtReaction(view.theirs)}</span>
          </div>
        </Center>
      )}

      {view.phase === "done" && (
        <Center>
          <p className="font-display text-3xl font-extrabold text-ink">
            Duel complete
          </p>
          <p className="mt-3 animate-pulse-soft text-sm text-muted">
            {partnerResult ? "Scoring…" : `Waiting for ${partnerName} to finish…`}
          </p>
        </Center>
      )}
    </div>
  );
}

function pips(count: number): string {
  return "●".repeat(count) + "○".repeat(Math.max(0, SUBROUNDS_TO_WIN - count));
}

function fmtReaction(r: Reaction | null): string {
  if (!r) return "…";
  if (r.falseStart) return "false start";
  if (r.reactionMs === null) return "no click";
  return `${r.reactionMs} ms`;
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center text-center"
    >
      {children}
    </motion.div>
  );
}
