"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ConnectionDot } from "@/components/lobby/ConnectionDot";
import { soundManager } from "@/lib/sound";
import type { RoomSession } from "@/hooks/useRoomSession";
import type { MatchController } from "@/hooks/useMatch";

const MODES = [
  {
    id: "quick",
    name: "Quick Match",
    detail: "Best of 3 · random games",
    available: true,
  },
  {
    id: "date_night",
    name: "Date Night",
    detail: "Best of 7 · arcade + physical",
    available: false,
  },
  {
    id: "chaos",
    name: "Chaos Mode",
    detail: "Best of 9 · with modifiers",
    available: false,
  },
  {
    id: "custom",
    name: "Custom",
    detail: "Pick rounds & games",
    available: false,
  },
] as const;

export function Lobby({
  session,
  match,
}: {
  session: RoomSession;
  match: MatchController;
}) {
  const { me, partner, partnerOnline, quality, room } = session;
  const [copied, setCopied] = useState(false);
  const partnerWasHere = useRef(false);

  // A join chime when the partner first appears.
  useEffect(() => {
    if (partnerOnline && !partnerWasHere.current) {
      partnerWasHere.current = true;
      soundManager.play("join");
    }
  }, [partnerOnline]);

  const bothPresent = Boolean(partner) && partnerOnline;
  const rematchLobby = match.state.outcomes.length > 0;

  async function copyInvite() {
    if (!room) return;
    const url = `${window.location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — the code is on screen anyway
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center px-6 py-10">
      <header className="flex w-full items-center justify-between">
        <span className="font-display text-sm font-bold tracking-wide text-muted">
          <span className="text-gradient-duo">Duo</span>Arcade
        </span>
        <ConnectionDot quality={quality} />
      </header>

      <section className="mt-10 text-center">
        <p className="font-display text-xs uppercase tracking-[0.35em] text-muted">
          Room code
        </p>
        <button
          onClick={copyInvite}
          title="Copy invite link"
          className="mt-2 cursor-pointer font-display text-5xl font-extrabold tracking-[0.25em] text-ink transition hover:opacity-80 sm:text-6xl"
        >
          {room?.code}
        </button>
        <p className="mt-2 h-5 text-xs text-muted">
          {copied ? (
            <span className="text-go">Invite link copied ♥</span>
          ) : (
            "Click the code to copy an invite link"
          )}
        </p>
      </section>

      <section className="mt-10 grid w-full grid-cols-[1fr_auto_1fr] items-stretch gap-4 sm:gap-8">
        <PlayerCard
          name={me?.name ?? "You"}
          tag="You"
          accent={me?.role === "player2" ? "violet" : "rose"}
          present
          ready={match.myReady}
        />
        <div className="vs-spine relative mx-auto self-stretch">
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-raised px-2.5 py-1 font-display text-xs font-bold text-muted">
            VS
          </span>
        </div>
        <PlayerCard
          name={partner?.name ?? "Waiting…"}
          tag={partner ? (partnerOnline ? "Partner" : "Reconnecting…") : "Empty seat"}
          accent={me?.role === "player2" ? "rose" : "violet"}
          present={Boolean(partner) && partnerOnline}
          ready={match.partnerReady}
        />
      </section>

      {!bothPresent && (
        <p className="mt-6 animate-pulse-soft text-sm text-muted">
          {partner && !partnerOnline
            ? `Waiting for ${partner.name} to reconnect…`
            : "Send the code to your partner — the match starts when you both ready up."}
        </p>
      )}

      <section className="mt-10 w-full">
        <p className="text-sm font-medium text-muted">Match type</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((mode) => (
            <div
              key={mode.id}
              className={`glass rounded-2xl p-4 ${
                mode.available
                  ? "border-rose/40 shadow-[0_0_24px_rgba(255,77,125,0.12)]"
                  : "opacity-45"
              }`}
            >
              <p className="font-display text-sm font-bold text-ink">{mode.name}</p>
              <p className="mt-1 text-xs text-muted">{mode.detail}</p>
              {!mode.available && (
                <p className="mt-2 inline-block rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                  Coming soon
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          size="lg"
          variant={match.myReady ? "ghost" : "primary"}
          disabled={!bothPresent}
          onClick={() => {
            soundManager.play("ready");
            match.toggleReady();
          }}
          className="min-w-56"
        >
          {match.myReady ? "Cancel ready" : rematchLobby ? "Ready for rematch" : "Ready up"}
        </Button>
        <p className="h-5 text-xs text-muted">
          {match.myReady && !match.partnerReady && "Waiting for your partner to ready up…"}
          {match.myReady && match.partnerReady && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-go"
            >
              Both ready — starting!
            </motion.span>
          )}
        </p>
      </div>
    </div>
  );
}

function PlayerCard({
  name,
  tag,
  accent,
  present,
  ready,
}: {
  name: string;
  tag: string;
  accent: "rose" | "violet";
  present: boolean;
  ready: boolean;
}) {
  const accentText = accent === "rose" ? "text-rose" : "text-violet-soft";
  const accentRing = accent === "rose" ? "border-rose/50" : "border-violet/50";
  return (
    <motion.div
      layout
      className={`glass flex flex-col items-center justify-center rounded-3xl px-4 py-8 text-center ${
        present ? accentRing : ""
      }`}
    >
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full bg-raised font-display text-xl font-bold ${
          present ? accentText : "text-muted"
        }`}
      >
        {present ? name.charAt(0).toUpperCase() : "?"}
      </div>
      <p className="mt-3 max-w-full truncate font-display text-lg font-bold text-ink">
        {name}
      </p>
      <p className={`mt-1 text-xs ${present ? "text-muted" : "animate-pulse-soft text-muted"}`}>
        {tag}
      </p>
      <p
        className={`mt-3 rounded-full px-3 py-1 text-xs font-semibold ${
          ready ? "bg-go/15 text-go" : "bg-white/5 text-muted"
        }`}
      >
        {ready ? "READY" : "Not ready"}
      </p>
    </motion.div>
  );
}
