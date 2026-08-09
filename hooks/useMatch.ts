"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  hydrateFromSnapshot,
  initialMatchState,
  isMatchOver,
  matchReducer,
} from "@/lib/match/machine";
import { resolveRound } from "@/lib/match/winner";
import { getGame, selectGames, targetWinsForMode } from "@/games/registry";
import { roundSeed } from "@/lib/random";
import { persistCompletedMatch, type PersistedMatchSummary } from "@/lib/persist";
import { getSupabase } from "@/lib/supabase";
import type { RoomSession } from "@/hooks/useRoomSession";
import type { RoomEvent } from "@/types/events";
import type { GameDefinition, GameProps, PlayerResult, RoundOutcome } from "@/types/game";
import type { MatchMode, MatchState } from "@/types/match";
import type { PlayerRole } from "@/types/player";

const COUNTDOWN_LEAD_MS = 3800;
const ROUND_RESULT_DISPLAY_MS = 7000;
const MATCH_RESULT_DELAY_MS = 5000;

export interface MatchController {
  state: MatchState;
  myReady: boolean;
  partnerReady: boolean;
  toggleReady: () => void;
  currentGame: GameDefinition | null;
  /** Present while phase is countdown/in_game. */
  gameProps: GameProps | null;
  lastOutcome: RoundOutcome | null;
  xpSummary: PersistedMatchSummary | null;
  partnerResult: PlayerResult | null;
  myResultIn: boolean;
  /** Development-only escape hatches; used by the DevPanel. */
  _dev: {
    inject: (event: RoomEvent) => void;
    reset: () => void;
  };
}

type ReadyFlags = Record<PlayerRole, boolean>;
const noReady: ReadyFlags = { player1: false, player2: false };

/**
 * The match controller. Both clients run the same pure reducer over the
 * same event stream; the host (player1) additionally makes the
 * non-deterministic calls — configuring matches, scheduling countdowns —
 * and broadcasts them. Round winners are computed independently on both
 * sides from the exchanged GAME_RESULTs (deterministic).
 */
export function useMatch(session: RoomSession, mode: MatchMode = "quick"): MatchController {
  const [state, dispatch] = useReducer(matchReducer, undefined, initialMatchState);
  const [ready, setReady] = useState<ReadyFlags>(noReady);
  const [xpSummary, setXpSummary] = useState<PersistedMatchSummary | null>(null);
  const [partnerResult, setPartnerResult] = useState<PlayerResult | null>(null);
  const [myResultIn, setMyResultIn] = useState(false);

  const stateRef = useRef(state);
  const readyRef = useRef(ready);
  useEffect(() => {
    stateRef.current = state;
    readyRef.current = ready;
  }, [state, ready]);

  const resultsRef = useRef(new Map<number, Partial<Record<PlayerRole, PlayerResult>>>());
  const gameEventHandlersRef = useRef(new Set<(payload: Record<string, unknown>) => void>());
  const configuredForRef = useRef<string | null>(null);
  const persistedForRef = useRef<number | null>(null);
  const snapshotRequestedRef = useRef(false);

  const { role, me, partner, send, subscribe, now, isHost, room } = session;
  const myRole = role;

  const tryResolveRound = useCallback((round: number) => {
    const s = stateRef.current;
    if (s.phase !== "in_game" || s.round !== round || !s.config) return;
    const entry = resultsRef.current.get(round);
    if (!entry?.player1 || !entry.player2) return;
    const game = getGame(s.config.games[round]);
    if (!game) return;
    const outcome = resolveRound(game, round, entry.player1, entry.player2);
    dispatch({ type: "ROUND_COMPLETE", outcome });
  }, []);

  /** Apply an event to local state — same path for incoming and self-sent. */
  const applyEvent = useCallback(
    (event: RoomEvent) => {
      switch (event.type) {
        case "PLAYER_READY": {
          if (!myRole) return;
          const forRole: PlayerRole =
            event.playerId === me?.id ? myRole : myRole === "player1" ? "player2" : "player1";
          setReady((prev) => ({ ...prev, [forRole]: event.ready }));
          break;
        }
        case "MATCH_CONFIGURED": {
          resultsRef.current.clear();
          setReady(noReady);
          setXpSummary(null);
          setPartnerResult(null);
          setMyResultIn(false);
          dispatch({ type: "CONFIGURE", config: event.config });
          break;
        }
        case "COUNTDOWN_STARTED": {
          setPartnerResult(null);
          setMyResultIn(false);
          dispatch({ type: "COUNTDOWN", startAt: event.startAt, round: event.round });
          break;
        }
        case "GAME_EVENT": {
          if (event.playerId === me?.id) return;
          if (event.round !== stateRef.current.round) return;
          for (const h of gameEventHandlersRef.current) h(event.payload);
          break;
        }
        case "GAME_RESULT": {
          if (!myRole || event.playerId === me?.id) return;
          const partnerRole: PlayerRole = myRole === "player1" ? "player2" : "player1";
          const entry = resultsRef.current.get(event.round) ?? {};
          const firstTime = !entry[partnerRole];
          entry[partnerRole] = event.result;
          resultsRef.current.set(event.round, entry);
          if (event.round === stateRef.current.round) setPartnerResult(event.result);
          // If we already reported and the partner just (re)learned nothing
          // of ours — e.g. they reconnected and missed it — resend ours once.
          const mine = entry[myRole];
          if (firstTime && mine && me) {
            send({
              type: "GAME_RESULT",
              playerId: me.id,
              round: event.round,
              result: mine,
            });
          }
          tryResolveRound(event.round);
          break;
        }
        case "MATCH_PERSISTED": {
          setXpSummary({
            coupleXpEarned: event.coupleXpEarned,
            coupleXpTotal: event.coupleXpTotal,
            totalMatches: event.totalMatches,
          });
          break;
        }
        case "STATE_REQUEST": {
          if (event.playerId === me?.id) return;
          send({
            type: "STATE_SNAPSHOT",
            forPlayerId: event.playerId,
            snapshot: {
              match: stateRef.current as unknown as Record<string, unknown>,
              ready: readyRef.current,
            } as unknown as Record<string, unknown>,
          });
          break;
        }
        case "STATE_SNAPSHOT": {
          if (event.forPlayerId !== me?.id) return;
          const hydrated = hydrateFromSnapshot(event.snapshot.match);
          if (!hydrated) return;
          dispatch({ type: "HYDRATE", state: hydrated });
          const snapReady = event.snapshot.ready as Partial<ReadyFlags> | undefined;
          if (snapReady) {
            setReady({
              player1: Boolean(snapReady.player1),
              player2: Boolean(snapReady.player2),
            });
          }
          // Mid-round reconnects concede the round honestly: we can't
          // rejoin a game already in progress, so submit an incomplete
          // result and let the partner's finish settle it.
          if (hydrated.phase === "in_game" && myRole && me) {
            const incomplete: PlayerResult = {
              rawScore: 0,
              normalizedScore: 0,
              completed: false,
            };
            const entry = resultsRef.current.get(hydrated.round) ?? {};
            if (!entry[myRole]) {
              entry[myRole] = incomplete;
              resultsRef.current.set(hydrated.round, entry);
              setMyResultIn(true);
              send({
                type: "GAME_RESULT",
                playerId: me.id,
                round: hydrated.round,
                result: incomplete,
              });
            }
          }
          break;
        }
        default:
          break;
      }
    },
    [me, myRole, send, tryResolveRound],
  );

  const sendAndApply = useCallback(
    (event: RoomEvent) => {
      // Broadcast excludes self, so self-sent events apply locally too.
      applyEvent(event);
      send(event);
    },
    [applyEvent, send],
  );

  // Fan in partner events.
  useEffect(() => {
    if (session.status !== "ready") return;
    return subscribe(applyEvent);
  }, [session.status, subscribe, applyEvent]);

  // On rejoin after a refresh, ask the partner for the current state.
  useEffect(() => {
    if (
      session.status === "ready" &&
      session.rejoined &&
      session.partnerOnline &&
      me &&
      !snapshotRequestedRef.current
    ) {
      snapshotRequestedRef.current = true;
      send({ type: "STATE_REQUEST", playerId: me.id });
    }
  }, [session.status, session.rejoined, session.partnerOnline, me, send]);

  const toggleReady = useCallback(() => {
    if (!me || !myRole) return;
    const next = !readyRef.current[myRole];
    sendAndApply({ type: "PLAYER_READY", playerId: me.id, ready: next });
  }, [me, myRole, sendAndApply]);

  // Host: both ready in lobby/match_result → configure a fresh match.
  useEffect(() => {
    if (!isHost || !me || !partner) return;
    if (state.phase !== "lobby" && state.phase !== "match_result") return;
    if (!ready.player1 || !ready.player2) return;
    // One configure per ready-up; the old config's seed distinguishes rematches.
    const configKey = `${state.phase}:${state.config?.seed ?? "none"}:${state.outcomes.length}`;
    if (configuredForRef.current === configKey) return;
    configuredForRef.current = configKey;

    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now()) >>> 0;
    sendAndApply({
      type: "MATCH_CONFIGURED",
      config: {
        mode,
        targetWins: targetWinsForMode(mode),
        seed,
        games: selectGames(mode, seed, false),
      },
    });
  }, [isHost, me, partner, mode, ready, state, sendAndApply]);

  // Host: a freshly configured match kicks off round 0 after a beat.
  const kickoffDoneRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isHost || state.phase !== "lobby" || !state.config) return;
    if (state.outcomes.length !== 0 || state.startAt !== null) return;
    const seed = state.config.seed;
    if (kickoffDoneRef.current === seed) return;
    const timer = setTimeout(() => {
      kickoffDoneRef.current = seed;
      sendAndApply({
        type: "COUNTDOWN_STARTED",
        startAt: now() + COUNTDOWN_LEAD_MS,
        round: 0,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [isHost, state, sendAndApply, now]);

  // Countdown reaches zero → the game is on (each client fires locally).
  useEffect(() => {
    if (state.phase !== "countdown" || state.startAt === null) return;
    const delay = Math.max(0, state.startAt - now());
    const timer = setTimeout(() => dispatch({ type: "GAME_STARTED" }), delay);
    return () => clearTimeout(timer);
  }, [state.phase, state.startAt, now]);

  // Host: advance to the next round after the result screen.
  useEffect(() => {
    if (!isHost || state.phase !== "round_result" || isMatchOver(state)) return;
    const nextRound = state.outcomes.length;
    const timer = setTimeout(() => {
      sendAndApply({
        type: "COUNTDOWN_STARTED",
        startAt: now() + COUNTDOWN_LEAD_MS,
        round: nextRound,
      });
    }, ROUND_RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [isHost, state, sendAndApply, now]);

  // Both clients: once the match is decided, move to the final screen.
  useEffect(() => {
    if (state.phase !== "round_result" || !isMatchOver(state)) return;
    const timer = setTimeout(
      () => dispatch({ type: "SHOW_MATCH_RESULT" }),
      MATCH_RESULT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [state]);

  // Host: persist the finished match once, then share the XP summary.
  useEffect(() => {
    if (!isHost || state.phase !== "match_result" || !state.config) return;
    if (!room || !me || !partner || myRole !== "player1") return;
    if (persistedForRef.current === state.config.seed) return;
    persistedForRef.current = state.config.seed;
    const { config } = state;
    void (async () => {
      const summary = await persistCompletedMatch({
        roomId: room.id,
        config,
        state,
        player1: me,
        player2: partner,
      });
      if (summary) {
        setXpSummary(summary);
        send({ type: "MATCH_PERSISTED", ...summary });
      }
      try {
        await getSupabase().from("rooms").update({ status: "lobby" }).eq("id", room.id);
      } catch {
        // best-effort
      }
    })();
  }, [isHost, state, room, me, partner, myRole, send]);

  // Room status flips to in_match when a match kicks off (host, best-effort).
  useEffect(() => {
    if (!isHost || !room || state.phase !== "countdown" || state.round !== 0) return;
    void getSupabase()
      .from("rooms")
      .update({ status: "in_match" })
      .eq("id", room.id)
      .then(undefined, () => {});
  }, [isHost, room, state.phase, state.round]);

  const submitResult = useCallback(
    (round: number, result: PlayerResult) => {
      if (!me || !myRole) return;
      const entry = resultsRef.current.get(round) ?? {};
      if (entry[myRole]) return; // one result per round
      entry[myRole] = result;
      resultsRef.current.set(round, entry);
      setMyResultIn(true);
      send({ type: "GAME_RESULT", playerId: me.id, round, result });
      tryResolveRound(round);
    },
    [me, myRole, send, tryResolveRound],
  );

  const currentGame = useMemo(() => {
    if (!state.config) return null;
    if (state.phase !== "countdown" && state.phase !== "in_game") return null;
    return getGame(state.config.games[state.round]);
  }, [state.config, state.phase, state.round]);

  const gameProps = useMemo<GameProps | null>(() => {
    if (!state.config || !me || !myRole || state.startAt === null) return null;
    if (state.phase !== "countdown" && state.phase !== "in_game") return null;
    const round = state.round;
    return {
      seed: roundSeed(state.config.seed, round),
      round,
      role: myRole,
      playerName: me.name,
      partnerName: partner?.name ?? "Partner",
      startAt: state.startAt,
      now,
      sendGameEvent: (payload) =>
        send({ type: "GAME_EVENT", playerId: me.id, round, payload }),
      onGameEvent: (handler) => {
        gameEventHandlersRef.current.add(handler);
        return () => {
          gameEventHandlersRef.current.delete(handler);
        };
      },
      onFinish: (result) => submitResult(round, result),
      partnerResult,
    };
  }, [state.config, state.phase, state.round, state.startAt, me, myRole, partner, now, send, submitResult, partnerResult]);

  return {
    state,
    myReady: myRole ? ready[myRole] : false,
    partnerReady: myRole ? ready[myRole === "player1" ? "player2" : "player1"] : false,
    toggleReady,
    currentGame,
    gameProps,
    lastOutcome: state.outcomes[state.outcomes.length - 1] ?? null,
    xpSummary,
    partnerResult,
    myResultIn,
    _dev: {
      inject: applyEvent,
      reset: () => dispatch({ type: "RESET" }),
    },
  };
}
