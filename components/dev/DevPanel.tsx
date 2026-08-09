"use client";

import { useState } from "react";
import type { RoomSession } from "@/hooks/useRoomSession";
import type { MatchController } from "@/hooks/useMatch";

/**
 * Development-only panel: inspect room/match state and drive the match
 * without a second human. Never rendered in production builds.
 */
export function DevPanel({
  session,
  match,
}: {
  session: RoomSession;
  match: MatchController;
}) {
  const [open, setOpen] = useState(false);
  if (process.env.NODE_ENV === "production") return null;

  const soloQuickdraw = () => {
    match._dev.inject({
      type: "MATCH_CONFIGURED",
      config: {
        mode: "quick",
        targetWins: 2,
        seed: 12345,
        games: ["quickdraw", "quickdraw", "quickdraw"],
      },
    });
    setTimeout(() => {
      match._dev.inject({
        type: "COUNTDOWN_STARTED",
        startAt: session.now() + 3500,
        round: 0,
      });
    }, 100);
  };

  const fakePartnerResult = () => {
    match._dev.inject({
      type: "GAME_RESULT",
      playerId: "__dev_partner__",
      round: match.state.round,
      result: {
        rawScore: 1,
        normalizedScore: 42.5,
        completed: true,
        detail: { avgReactionMs: 412 },
      },
    });
  };

  const snapshot = {
    phase: match.state.phase,
    round: match.state.round,
    crowns: match.state.crowns,
    winner: match.state.matchWinner,
    ready: { me: match.myReady, partner: match.partnerReady },
    role: session.role,
    status: session.status,
    quality: session.quality,
    partnerOnline: session.partnerOnline,
    games: match.state.config?.games ?? null,
    seed: match.state.config?.seed ?? null,
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 text-xs">
      {open ? (
        <div className="w-72 rounded-xl border border-edge bg-raised/95 p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-peach">DEV</span>
            <button className="cursor-pointer text-muted hover:text-ink" onClick={() => setOpen(false)}>
              close
            </button>
          </div>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-bg/70 p-2 text-[10px] leading-relaxed text-muted">
            {JSON.stringify(snapshot, null, 1)}
          </pre>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <DevButton onClick={soloQuickdraw}>Solo quickdraw</DevButton>
            <DevButton onClick={fakePartnerResult}>Fake partner result</DevButton>
            <DevButton
              onClick={() =>
                match._dev.inject({
                  type: "PLAYER_READY",
                  playerId: "__dev_partner__",
                  ready: true,
                })
              }
            >
              Fake partner ready
            </DevButton>
            <DevButton onClick={() => match._dev.reset()}>Reset match</DevButton>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-full border border-edge bg-raised/90 px-3 py-1.5 font-semibold text-muted hover:text-ink"
        >
          dev
        </button>
      )}
    </div>
  );
}

function DevButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-edge bg-bg/60 px-2 py-1.5 text-muted transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}
