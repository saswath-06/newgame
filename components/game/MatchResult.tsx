"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Confetti } from "@/components/ui/Confetti";
import { soundManager } from "@/lib/sound";
import { matchResultLine } from "@/lib/messages";
import { computeHighlights } from "@/lib/match/highlights";
import type { RoomSession } from "@/hooks/useRoomSession";
import type { MatchController } from "@/hooks/useMatch";

export function MatchResult({
  session,
  match,
}: {
  session: RoomSession;
  match: MatchController;
}) {
  const myRole = session.role ?? "player1";
  const partnerRole = myRole === "player1" ? "player2" : "player1";
  const { state, xpSummary } = match;
  const iWon = state.matchWinner === myRole;
  const tie = state.matchWinner === null;
  const winnerName = tie
    ? null
    : state.matchWinner === myRole
      ? session.me?.name
      : session.partner?.name;

  useEffect(() => {
    soundManager.play(iWon ? "victory" : tie ? "point" : "defeat");
  }, [iWon, tie]);

  const names = {
    player1: myRole === "player1" ? (session.me?.name ?? "Player 1") : (session.partner?.name ?? "Player 1"),
    player2: myRole === "player2" ? (session.me?.name ?? "Player 2") : (session.partner?.name ?? "Player 2"),
  };
  const highlights = computeHighlights(state.outcomes, names);
  const line = matchResultLine((state.config?.seed ?? 1) * 31, tie);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      {iWon && <Confetti burst={180} />}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg text-center"
      >
        <p className="font-display text-xs uppercase tracking-[0.4em] text-muted">
          Match complete
        </p>

        <div className="mt-8 space-y-4">
          <CrownLine
            name={session.me?.name ?? "You"}
            crowns={state.crowns[myRole]}
            accent={myRole === "player1" ? "rose" : "violet"}
            winner={state.matchWinner === myRole}
          />
          <p className="font-display text-4xl font-extrabold text-ink">
            {state.crowns[myRole]}
            <span className="mx-3 text-muted">—</span>
            {state.crowns[partnerRole]}
          </p>
          <CrownLine
            name={session.partner?.name ?? "Partner"}
            crowns={state.crowns[partnerRole]}
            accent={partnerRole === "player1" ? "rose" : "violet"}
            winner={state.matchWinner === partnerRole}
          />
        </div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 font-display text-3xl font-extrabold"
        >
          {tie ? (
            <span className="text-ink">A PERFECT DRAW</span>
          ) : (
            <span className={iWon ? "text-gradient-duo glow-rose" : "text-ink"}>
              {winnerName?.toUpperCase()} WINS
            </span>
          )}
        </motion.p>
        <p className="mt-2 text-sm text-muted">&ldquo;{line}&rdquo;</p>

        {xpSummary && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-6 font-display text-sm font-semibold text-rose-soft"
          >
            +{xpSummary.coupleXpEarned} Couple XP ♥
            {xpSummary.coupleXpTotal !== null && (
              <span className="ml-2 text-muted">
                ({xpSummary.coupleXpTotal} total
                {xpSummary.totalMatches !== null &&
                  ` · ${xpSummary.totalMatches} matches together`}
                )
              </span>
            )}
          </motion.p>
        )}

        {highlights.length > 0 && (
          <div className="glass mx-auto mt-8 max-w-sm rounded-2xl p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Match highlights
            </p>
            <ul className="mt-2 space-y-2">
              {highlights.map((h) => (
                <li key={h.label} className="flex items-start gap-2 text-sm">
                  <span aria-hidden>{h.icon}</span>
                  <span>
                    <span className="text-muted">{h.label}: </span>
                    <span className="text-ink">{h.value}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="min-w-56"
            variant={match.myReady ? "ghost" : "primary"}
            disabled={!session.partnerOnline}
            onClick={() => {
              soundManager.play("ready");
              match.toggleReady();
            }}
          >
            {match.myReady ? "Waiting for partner…" : "Rematch"}
          </Button>
          {match.partnerReady && !match.myReady && (
            <p className="animate-pulse-soft text-xs text-go">
              {session.partner?.name} wants a rematch!
            </p>
          )}
          {!session.partnerOnline && (
            <p className="text-xs text-muted">
              Your partner disconnected — they can rejoin with the room code.
            </p>
          )}
          <Link href="/" className="text-xs text-muted underline-offset-4 hover:underline">
            Leave the arcade
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function CrownLine({
  name,
  crowns,
  accent,
  winner,
}: {
  name: string;
  crowns: number;
  accent: "rose" | "violet";
  winner: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <p
        className={`font-display text-lg font-bold ${
          accent === "rose" ? "text-rose" : "text-violet-soft"
        }`}
      >
        {name}
        {winner && " 🏆"}
      </p>
      <p className="text-lg" aria-label={`${crowns} crowns`}>
        {crowns > 0 ? "👑".repeat(Math.min(crowns, 9)) : "—"}
      </p>
    </div>
  );
}
