"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectionDot } from "@/components/lobby/ConnectionDot";
import { soundManager } from "@/lib/sound";
import type { RoomSession } from "@/hooks/useRoomSession";
import type { MatchController } from "@/hooks/useMatch";
import { maxRounds } from "@/lib/match/machine";
import { getModifier } from "@/games/modifiers";

/**
 * The immersive game area: HUD (round, crowns, connection) around the
 * mounted game component, with the synchronized countdown overlay on top.
 */
export function GameStage({
  session,
  match,
}: {
  session: RoomSession;
  match: MatchController;
}) {
  const { state, currentGame, gameProps } = match;
  const roundsTotal = state.config ? maxRounds(state.config) : 0;
  const myRole = session.role ?? "player1";
  const partnerRole = myRole === "player1" ? "player2" : "player1";
  const activeModifiers = (state.config?.roundModifiers?.[state.round] ?? [])
    .map(getModifier)
    .filter((m) => m !== null);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {currentGame?.icon}
          </span>
          <div>
            <p className="font-display text-sm font-bold text-ink">
              {currentGame?.name}
            </p>
            <p className="text-xs text-muted">
              Round {state.round + 1} of {roundsTotal}
            </p>
          </div>
          {activeModifiers.map((mod) => (
            <span
              key={mod.id}
              title={mod.description}
              className="animate-pulse-soft rounded-full bg-peach/15 px-3 py-1 font-display text-xs font-bold text-peach"
            >
              {mod.icon} {mod.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-5">
          <CrownRow
            mine={state.crowns[myRole]}
            theirs={state.crowns[partnerRole]}
            myName={session.me?.name ?? "You"}
            partnerName={session.partner?.name ?? "Partner"}
          />
          <ConnectionDot quality={session.quality} />
        </div>
      </header>

      <div className="relative mx-6 mb-6 flex-1 overflow-hidden rounded-3xl border border-edge bg-raised/40">
        {state.phase === "in_game" && currentGame && gameProps && (
          <currentGame.component {...gameProps} />
        )}
        {state.phase === "countdown" && state.startAt !== null && (
          <CountdownOverlay startAt={state.startAt} now={session.now} />
        )}
        {!session.partnerOnline && state.phase === "in_game" && (
          <div className="absolute inset-x-0 top-4 mx-auto w-fit rounded-full bg-raised/90 px-4 py-2 text-xs text-peach">
            Waiting for your partner to reconnect…
          </div>
        )}
      </div>
    </div>
  );
}

function CrownRow({
  mine,
  theirs,
  myName,
  partnerName,
}: {
  mine: number;
  theirs: number;
  myName: string;
  partnerName: string;
}) {
  return (
    <div
      className="flex items-center gap-2 font-display text-sm font-bold"
      title={`${myName} ${mine} — ${theirs} ${partnerName}`}
    >
      <span className="text-rose">{mine}</span>
      <span aria-hidden>👑</span>
      <span className="text-violet-soft">{theirs}</span>
    </div>
  );
}

function CountdownOverlay({
  startAt,
  now,
}: {
  startAt: number;
  now: () => number;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((startAt - now()) / 1000)),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((startAt - now()) / 1000)));
    }, 100);
    return () => clearInterval(timer);
  }, [startAt, now]);

  useEffect(() => {
    if (secondsLeft > 0 && secondsLeft <= 3) soundManager.play("countdown");
    if (secondsLeft === 0) soundManager.play("go");
  }, [secondsLeft]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
      <AnimatePresence mode="popLayout">
        <motion.p
          key={secondsLeft}
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`font-display font-extrabold ${
            secondsLeft === 0
              ? "text-7xl text-gradient-duo glow-rose sm:text-8xl"
              : "text-8xl text-ink sm:text-9xl"
          }`}
        >
          {secondsLeft === 0 ? "GO!" : secondsLeft}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
