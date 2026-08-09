import type { CustomSettings, MatchConfig, MatchMode } from "./match";
import type { PlayerResult } from "./game";
import type { PlayerRole } from "./player";

const MATCH_MODES: readonly MatchMode[] = ["quick", "date_night", "chaos", "custom"];

/**
 * Every message broadcast on a room channel. Discriminated on `type` so
 * handlers can switch exhaustively; `parseRoomEvent` validates incoming
 * payloads before they reach any game or match logic.
 */
export type RoomEvent =
  | { type: "PLAYER_JOINED"; playerId: string; name: string; role: PlayerRole }
  | { type: "PLAYER_READY"; playerId: string; ready: boolean }
  | { type: "MODE_SELECTED"; mode: MatchMode; custom?: CustomSettings }
  | { type: "MATCH_CONFIGURED"; config: MatchConfig }
  | { type: "COUNTDOWN_STARTED"; startAt: number; round: number }
  | {
      type: "GAME_EVENT";
      playerId: string;
      round: number;
      payload: Record<string, unknown>;
    }
  | {
      type: "GAME_RESULT";
      playerId: string;
      round: number;
      result: PlayerResult;
    }
  | { type: "LEAVE_ROOM"; playerId: string }
  | {
      type: "MATCH_PERSISTED";
      coupleXpEarned: number;
      coupleXpTotal: number | null;
      totalMatches: number | null;
    }
  | { type: "STATE_REQUEST"; playerId: string }
  | {
      type: "STATE_SNAPSHOT";
      forPlayerId: string;
      snapshot: Record<string, unknown>;
    }
  | { type: "PING"; from: string; nonce: number; sentAt: number }
  | { type: "PONG"; from: string; to: string; nonce: number; peerAt: number };

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isPlayerResult(v: unknown): v is PlayerResult {
  return (
    isObj(v) &&
    isNum(v.rawScore) &&
    isNum(v.normalizedScore) &&
    v.normalizedScore >= 0 &&
    v.normalizedScore <= 100 &&
    isBool(v.completed)
  );
}

function isMatchConfig(v: unknown): v is MatchConfig {
  return (
    isObj(v) &&
    isStr(v.mode) &&
    isNum(v.targetWins) &&
    v.targetWins >= 1 &&
    isNum(v.seed) &&
    Array.isArray(v.games) &&
    v.games.length > 0 &&
    v.games.every(isStr) &&
    (v.roundModifiers === undefined ||
      (Array.isArray(v.roundModifiers) &&
        v.roundModifiers.every((r) => Array.isArray(r) && r.every(isStr))))
  );
}

function isCustomSettings(v: unknown): v is CustomSettings {
  return (
    isObj(v) &&
    isNum(v.targetWins) &&
    v.targetWins >= 1 &&
    v.targetWins <= 5 &&
    Array.isArray(v.gameIds) &&
    v.gameIds.every(isStr)
  );
}

/**
 * Validate an untrusted payload into a RoomEvent, or null if malformed.
 * Casual-game strictness: shape checks, not cheat-proofing.
 */
export function parseRoomEvent(raw: unknown): RoomEvent | null {
  if (!isObj(raw) || !isStr(raw.type)) return null;
  switch (raw.type) {
    case "PLAYER_JOINED":
      return isStr(raw.playerId) &&
        isStr(raw.name) &&
        (raw.role === "player1" || raw.role === "player2")
        ? { type: "PLAYER_JOINED", playerId: raw.playerId, name: raw.name, role: raw.role }
        : null;
    case "PLAYER_READY":
      return isStr(raw.playerId) && isBool(raw.ready)
        ? { type: "PLAYER_READY", playerId: raw.playerId, ready: raw.ready }
        : null;
    case "MODE_SELECTED": {
      if (!MATCH_MODES.includes(raw.mode as MatchMode)) return null;
      if (raw.custom !== undefined && !isCustomSettings(raw.custom)) return null;
      return {
        type: "MODE_SELECTED",
        mode: raw.mode as MatchMode,
        custom: raw.custom as CustomSettings | undefined,
      };
    }
    case "MATCH_CONFIGURED":
      return isMatchConfig(raw.config)
        ? { type: "MATCH_CONFIGURED", config: raw.config }
        : null;
    case "COUNTDOWN_STARTED":
      return isNum(raw.startAt) && isNum(raw.round)
        ? { type: "COUNTDOWN_STARTED", startAt: raw.startAt, round: raw.round }
        : null;
    case "GAME_EVENT":
      return isStr(raw.playerId) && isNum(raw.round) && isObj(raw.payload)
        ? {
            type: "GAME_EVENT",
            playerId: raw.playerId,
            round: raw.round,
            payload: raw.payload,
          }
        : null;
    case "GAME_RESULT":
      return isStr(raw.playerId) && isNum(raw.round) && isPlayerResult(raw.result)
        ? {
            type: "GAME_RESULT",
            playerId: raw.playerId,
            round: raw.round,
            result: raw.result,
          }
        : null;
    case "LEAVE_ROOM":
      return isStr(raw.playerId) ? { type: "LEAVE_ROOM", playerId: raw.playerId } : null;
    case "MATCH_PERSISTED":
      return isNum(raw.coupleXpEarned)
        ? {
            type: "MATCH_PERSISTED",
            coupleXpEarned: raw.coupleXpEarned,
            coupleXpTotal: isNum(raw.coupleXpTotal) ? raw.coupleXpTotal : null,
            totalMatches: isNum(raw.totalMatches) ? raw.totalMatches : null,
          }
        : null;
    case "STATE_REQUEST":
      return isStr(raw.playerId)
        ? { type: "STATE_REQUEST", playerId: raw.playerId }
        : null;
    case "STATE_SNAPSHOT":
      return isStr(raw.forPlayerId) && isObj(raw.snapshot)
        ? {
            type: "STATE_SNAPSHOT",
            forPlayerId: raw.forPlayerId,
            snapshot: raw.snapshot,
          }
        : null;
    case "PING":
      return isStr(raw.from) && isNum(raw.nonce) && isNum(raw.sentAt)
        ? { type: "PING", from: raw.from, nonce: raw.nonce, sentAt: raw.sentAt }
        : null;
    case "PONG":
      return isStr(raw.from) && isStr(raw.to) && isNum(raw.nonce) && isNum(raw.peerAt)
        ? {
            type: "PONG",
            from: raw.from,
            to: raw.to,
            nonce: raw.nonce,
            peerAt: raw.peerAt,
          }
        : null;
    default:
      return null;
  }
}
