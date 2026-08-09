"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ConnectionDot } from "@/components/lobby/ConnectionDot";
import { soundManager } from "@/lib/sound";
import { listGames } from "@/games/registry";
import type { RoomSession } from "@/hooks/useRoomSession";
import type { MatchController } from "@/hooks/useMatch";
import type { MatchMode } from "@/types/match";

const MODES: { id: MatchMode; name: string; detail: string }[] = [
  { id: "quick", name: "Quick Match", detail: "Best of 3 · random games" },
  {
    id: "date_night",
    name: "Date Night",
    detail: "Best of 7 · balanced mix",
  },
  { id: "chaos", name: "Chaos Mode", detail: "Best of 9 · wild modifiers" },
  { id: "custom", name: "Custom", detail: "Pick rounds & games" },
];

const CUSTOM_LENGTHS = [
  { targetWins: 1, label: "Best of 1" },
  { targetWins: 2, label: "Best of 3" },
  { targetWins: 3, label: "Best of 5" },
  { targetWins: 4, label: "Best of 7" },
];

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
        <p className="text-sm font-medium text-muted">
          Match type
          {!session.isHost && (
            <span className="ml-2 text-xs text-muted/70">
              ({session.partner?.name ?? "The host"} picks)
            </span>
          )}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((mode) => {
            const selected = match.selectedMode === mode.id;
            return (
              <button
                key={mode.id}
                disabled={!session.isHost}
                onClick={() => {
                  soundManager.play("click");
                  match.selectMode(mode.id);
                }}
                className={`glass rounded-2xl p-4 text-left transition-all ${
                  selected
                    ? "border-rose/50 shadow-[0_0_24px_rgba(255,77,125,0.15)]"
                    : "opacity-60"
                } ${session.isHost ? "cursor-pointer hover:opacity-100" : "cursor-default"}`}
              >
                <p className="font-display text-sm font-bold text-ink">{mode.name}</p>
                <p className="mt-1 text-xs text-muted">{mode.detail}</p>
                {selected && (
                  <p className="mt-2 inline-block rounded-full bg-rose/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-soft">
                    Selected
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {match.selectedMode === "custom" && (
          <CustomPanel match={match} isHost={session.isHost} />
        )}
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

function CustomPanel({
  match,
  isHost,
}: {
  match: MatchController;
  isHost: boolean;
}) {
  const { customSettings } = match;
  const games = listGames();

  const update = (partial: Partial<typeof customSettings>) => {
    match.selectMode("custom", { ...customSettings, ...partial });
  };

  const toggleGame = (id: string) => {
    const has = customSettings.gameIds.includes(id);
    const next = has
      ? customSettings.gameIds.filter((g) => g !== id)
      : [...customSettings.gameIds, id];
    if (next.length === 0) return; // at least one game stays selected
    update({ gameIds: next });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass mt-3 rounded-2xl p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Length</span>
        {CUSTOM_LENGTHS.map((len) => (
          <button
            key={len.targetWins}
            disabled={!isHost}
            onClick={() => update({ targetWins: len.targetWins })}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              customSettings.targetWins === len.targetWins
                ? "bg-rose/20 text-rose-soft"
                : "bg-white/5 text-muted"
            } ${isHost ? "cursor-pointer hover:text-ink" : "cursor-default"}`}
          >
            {len.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Games</span>
        {games.map((game) => {
          const on = customSettings.gameIds.includes(game.id);
          return (
            <button
              key={game.id}
              disabled={!isHost}
              onClick={() => toggleGame(game.id)}
              title={game.description}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                on ? "bg-violet/20 text-violet-soft" : "bg-white/5 text-muted/60"
              } ${isHost ? "cursor-pointer hover:text-ink" : "cursor-default"}`}
            >
              {game.icon} {game.name}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted/70">
        Physical (camera) games join the pool once camera support ships.
      </p>
    </motion.div>
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
