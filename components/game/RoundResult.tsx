"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Confetti } from "@/components/ui/Confetti";
import { soundManager } from "@/lib/sound";
import { getGame } from "@/games/registry";
import { roundResultLine } from "@/lib/messages";
import { isMatchOver } from "@/lib/match/machine";
import type { RoomSession } from "@/hooks/useRoomSession";
import type { MatchController } from "@/hooks/useMatch";

const NEXT_ROUND_SECONDS = 7;
const FINAL_SECONDS = 5;

export function RoundResult({
  session,
  match,
}: {
  session: RoomSession;
  match: MatchController;
}) {
  const outcome = match.lastOutcome;
  const myRole = session.role ?? "player1";
  const partnerRole = myRole === "player1" ? "player2" : "player1";
  const over = isMatchOver(match.state);
  const [seconds, setSeconds] = useState(over ? FINAL_SECONDS : NEXT_ROUND_SECONDS);

  const iWon = outcome?.winnerRole === myRole;
  const tie = outcome?.winnerRole === null;

  useEffect(() => {
    soundManager.play(iWon ? "round_win" : tie ? "point" : "round_lose");
  }, [iWon, tie]);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!outcome) return null;

  const game = getGame(outcome.gameId);
  const mine = outcome.results[myRole];
  const theirs = outcome.results[partnerRole];
  const margin = Math.abs(mine.normalizedScore - theirs.normalizedScore);
  const line = roundResultLine(outcome.round * 7919 + (match.state.config?.seed ?? 0), {
    tie,
    close: margin < 8,
  });
  const winnerName = tie
    ? null
    : outcome.winnerRole === myRole
      ? session.me?.name
      : session.partner?.name;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6">
      {iWon && <Confetti />}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg text-center"
      >
        <p className="font-display text-xs uppercase tracking-[0.35em] text-muted">
          {game?.icon} {game?.name} · Round {outcome.round + 1}
        </p>

        <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <ScoreCard
            name={session.me?.name ?? "You"}
            score={mine.normalizedScore}
            accent={myRole === "player1" ? "rose" : "violet"}
            won={outcome.winnerRole === myRole}
            detail={reactionDetail(mine.detail)}
          />
          <div className="vs-spine h-24 self-center" />
          <ScoreCard
            name={session.partner?.name ?? "Partner"}
            score={theirs.normalizedScore}
            accent={partnerRole === "player1" ? "rose" : "violet"}
            won={outcome.winnerRole === partnerRole}
            detail={reactionDetail(theirs.detail)}
          />
        </div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 font-display text-3xl font-extrabold text-ink"
        >
          {tie ? "IT'S A TIE" : `🏆 ${winnerName?.toUpperCase()} WINS`}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-2 text-sm text-muted"
        >
          &ldquo;{line}&rdquo;
        </motion.p>

        <p className="mt-10 font-display text-sm font-semibold text-muted">
          Crowns&nbsp;&nbsp;
          <span className="text-rose">{match.state.crowns[myRole]}</span>
          <span className="mx-2 text-muted">—</span>
          <span className="text-violet-soft">{match.state.crowns[partnerRole]}</span>
        </p>

        <p className="mt-6 text-xs text-muted">
          {over
            ? `Final results in ${seconds}s`
            : `Next game in ${seconds}s`}
        </p>
      </motion.div>
    </div>
  );
}

function reactionDetail(detail?: Record<string, number | string | boolean>): string | null {
  const ms = detail?.avgReactionMs;
  if (typeof ms === "number" && ms >= 0) return `${Math.round(ms)} ms avg`;
  return null;
}

function ScoreCard({
  name,
  score,
  accent,
  won,
  detail,
}: {
  name: string;
  score: number;
  accent: "rose" | "violet";
  won: boolean;
  detail: string | null;
}) {
  const text = accent === "rose" ? "text-rose" : "text-violet-soft";
  return (
    <div
      className={`glass rounded-3xl px-4 py-6 ${
        won ? (accent === "rose" ? "border-rose/50" : "border-violet/50") : ""
      }`}
    >
      <p className="truncate text-sm font-medium text-muted">{name}</p>
      <p className={`mt-1 font-display text-4xl font-extrabold ${text}`}>
        {score.toFixed(1)}
      </p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </div>
  );
}
