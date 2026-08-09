"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoomChannel, type PresenceMeta } from "@/lib/realtime/channel";
import { ClockSync } from "@/lib/realtime/clock";
import { joinRoom } from "@/lib/rooms";
import type { RoomEvent } from "@/types/events";
import type { PlayerIdentity, PlayerRole, RoomPlayer } from "@/types/player";
import type { ConnectionQuality, RoomRow } from "@/types/room";
import { otherRole } from "@/types/player";

export type SessionStatus =
  | "connecting"
  | "ready"
  | "not_found"
  | "full"
  | "error";

export interface RoomSession {
  status: SessionStatus;
  errorMessage: string | null;
  room: RoomRow | null;
  role: PlayerRole | null;
  isHost: boolean;
  me: RoomPlayer | null;
  partner: RoomPlayer | null;
  partnerOnline: boolean;
  quality: ConnectionQuality;
  /** True when this tab re-claimed a seat it already held (refresh). */
  rejoined: boolean;
  send: (event: RoomEvent) => void;
  /** Subscribe to validated partner events. Returns unsubscribe. */
  subscribe: (handler: (event: RoomEvent) => void) => () => void;
  /** Host-aligned clock for synchronized countdowns. */
  now: () => number;
}

const PING_INTERVAL_MS = 3000;
const QUALITY_TICK_MS = 2000;

/**
 * Joins the room (claiming or resuming a seat), maintains the realtime
 * channel, presence, and clock sync. Everything above (lobby, match) talks
 * through send/subscribe.
 */
export function useRoomSession(
  code: string,
  identity: PlayerIdentity | null,
): RoomSession {
  const [status, setStatus] = useState<SessionStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [rejoined, setRejoined] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [quality, setQuality] = useState<ConnectionQuality>("disconnected");

  const channelRef = useRef<RoomChannel | null>(null);
  const clockRef = useRef<ClockSync>(new ClockSync(true));
  const subscribersRef = useRef(new Set<(event: RoomEvent) => void>());
  const partnerOnlineRef = useRef(false);
  const identityId = identity?.id ?? null;
  const identityName = identity?.name ?? null;

  useEffect(() => {
    if (!identityId || !identityName || !code) return;
    let cancelled = false;
    let channel: RoomChannel | null = null;

    const connect = async () => {
      const outcome = await joinRoom(code, { id: identityId, name: identityName });
      if (cancelled) return;
      if (!outcome.ok) {
        setStatus(
          outcome.reason === "not_found"
            ? "not_found"
            : outcome.reason === "full"
              ? "full"
              : "error",
        );
        setErrorMessage(outcome.message ?? null);
        return;
      }

      const myRole = outcome.role;
      clockRef.current = new ClockSync(myRole === "player1");
      setRoom(outcome.room);
      setRole(myRole);
      setRejoined(outcome.rejoined);

      const meta: PresenceMeta = {
        playerId: identityId,
        name: identityName,
        role: myRole,
      };
      channel = new RoomChannel(outcome.room.code, meta);
      channelRef.current = channel;

      channel.onEvent((event) => {
        clockRef.current.heardFromPeer();
        // Transport-level events are handled here; the rest fan out.
        if (event.type === "PING") {
          channel?.send({
            type: "PONG",
            from: identityId,
            to: event.from,
            nonce: event.nonce,
            peerAt: Date.now(),
          });
          return;
        }
        if (event.type === "PONG") {
          if (event.to === identityId) {
            clockRef.current.recordPong(event.nonce, event.peerAt);
          }
          return;
        }
        if (event.type === "PLAYER_JOINED") {
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  status: prev.status === "waiting" ? "lobby" : prev.status,
                  [`${event.role}_id`]: event.playerId,
                  [`${event.role}_name`]: event.name,
                }
              : prev,
          );
        }
        for (const handler of subscribersRef.current) handler(event);
      });

      channel.onPresence((online) => {
        const partnerHere = online.some((p) => p.playerId !== identityId);
        partnerOnlineRef.current = partnerHere;
        setPartnerOnline(partnerHere);
        // Fill in partner details from presence if the row copy is stale.
        const partnerMeta = online.find((p) => p.playerId !== identityId);
        if (partnerMeta) {
          setRoom((prev) =>
            prev && !prev[`${partnerMeta.role}_id`]
              ? {
                  ...prev,
                  [`${partnerMeta.role}_id`]: partnerMeta.playerId,
                  [`${partnerMeta.role}_name`]: partnerMeta.name,
                }
              : prev,
          );
        }
      });

      try {
        await channel.join();
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Could not connect to the realtime channel.");
        }
        return;
      }
      if (cancelled) return;

      if (!outcome.rejoined && myRole === "player2") {
        channel.send({
          type: "PLAYER_JOINED",
          playerId: identityId,
          name: identityName,
          role: myRole,
        });
      }
      setStatus("ready");
    };

    void connect();

    const pingTimer = setInterval(() => {
      if (channelRef.current?.status === "connected" && partnerOnlineRef.current) {
        channelRef.current.send(clockRef.current.createPing(identityId));
      }
    }, PING_INTERVAL_MS);

    const qualityTimer = setInterval(() => {
      setQuality(clockRef.current.quality(partnerOnlineRef.current));
    }, QUALITY_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(pingTimer);
      clearInterval(qualityTimer);
      channelRef.current = null;
      if (channel) void channel.leave();
    };
  }, [code, identityId, identityName]);

  const send = useCallback((event: RoomEvent) => {
    channelRef.current?.send(event);
  }, []);

  const subscribe = useCallback((handler: (event: RoomEvent) => void) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  const now = useCallback(() => clockRef.current.now(), []);

  const { me, partner } = useMemo(() => {
    if (!room || !role || !identityId) return { me: null, partner: null };
    const mePlayer: RoomPlayer = {
      id: identityId,
      name: identityName ?? "You",
      role,
    };
    const pRole = otherRole(role);
    const pid = room[`${pRole}_id`];
    const pname = room[`${pRole}_name`];
    const partnerPlayer: RoomPlayer | null =
      pid && pname ? { id: pid, name: pname, role: pRole } : null;
    return { me: mePlayer, partner: partnerPlayer };
  }, [room, role, identityId, identityName]);

  return {
    status,
    errorMessage,
    room,
    role,
    isHost: role === "player1",
    me,
    partner,
    partnerOnline,
    quality,
    rejoined,
    send,
    subscribe,
    now,
  };
}
