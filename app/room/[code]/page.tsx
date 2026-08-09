"use client";

import { use, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { useRoomSession } from "@/hooks/useRoomSession";
import { useMatch } from "@/hooks/useMatch";
import { Lobby } from "@/components/lobby/Lobby";
import { GameStage } from "@/components/game/GameStage";
import { RoundResult } from "@/components/game/RoundResult";
import { MatchResult } from "@/components/game/MatchResult";
import { DevPanel } from "@/components/dev/DevPanel";
import { Button } from "@/components/ui/Button";

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const normalizedCode = code.toUpperCase();
  const { identity, claimIdentity, prefillName } = usePlayerIdentity();
  const session = useRoomSession(normalizedCode, identity);
  const match = useMatch(session);
  const [draftName, setDraftName] = useState("");

  if (!identity) {
    const prefill = prefillName;
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass w-full max-w-sm rounded-3xl p-6 text-center"
        >
          <p className="font-display text-xs uppercase tracking-[0.3em] text-muted">
            Joining room
          </p>
          <p className="mt-2 font-display text-3xl font-bold tracking-[0.2em] text-gradient-duo">
            {normalizedCode}
          </p>
          <label htmlFor="join-name" className="mt-6 block text-left text-sm text-muted">
            Your name
          </label>
          <input
            id="join-name"
            value={draftName || prefill}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={24}
            placeholder="What should your partner call you?"
            className="mt-2 w-full rounded-xl border border-edge bg-raised px-4 py-3 text-ink placeholder:text-muted/60 focus:border-rose/60 focus:outline-none"
            autoComplete="off"
          />
          <Button
            size="lg"
            className="mt-4 w-full"
            disabled={(draftName || prefill).trim().length === 0}
            onClick={() => claimIdentity(draftName || prefill)}
          >
            Enter room
          </Button>
        </motion.div>
      </main>
    );
  }

  if (session.status === "connecting") {
    return <CenteredNote>Connecting to room {normalizedCode}…</CenteredNote>;
  }
  if (session.status === "not_found") {
    return (
      <ErrorScreen
        title="Room not found"
        body={`No room with code ${normalizedCode} exists. Check the code with your partner, or create a fresh room.`}
      />
    );
  }
  if (session.status === "full") {
    return (
      <ErrorScreen
        title="Room is full"
        body="Two players are already in this room. DuoArcade rooms are built for exactly two."
      />
    );
  }
  if (session.status === "error") {
    return (
      <ErrorScreen
        title="Connection trouble"
        body={session.errorMessage ?? "Something went wrong connecting to the room. Refresh to try again."}
      />
    );
  }

  const { phase } = match.state;

  return (
    <main className="min-h-dvh">
      <AnimatePresence mode="wait">
        {phase === "lobby" && (
          <Screen key="lobby">
            <Lobby session={session} match={match} />
          </Screen>
        )}
        {(phase === "countdown" || phase === "in_game") && (
          <Screen key={`game-${match.state.round}`}>
            <GameStage session={session} match={match} />
          </Screen>
        )}
        {phase === "round_result" && (
          <Screen key={`result-${match.state.outcomes.length}`}>
            <RoundResult session={session} match={match} />
          </Screen>
        )}
        {phase === "match_result" && (
          <Screen key="match-result">
            <MatchResult session={session} match={match} />
          </Screen>
        )}
      </AnimatePresence>
      <DevPanel session={session} match={match} />
    </main>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  );
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="animate-pulse-soft font-display text-sm tracking-wide text-muted">
        {children}
      </p>
    </main>
  );
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="ghost">Back to start</Button>
        </Link>
      </div>
    </main>
  );
}
