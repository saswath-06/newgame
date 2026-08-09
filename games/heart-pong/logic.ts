import { mulberry32 } from "@/lib/random";
import type { PlayerResult } from "@/types/game";

/**
 * Heart Pong physics — pure and unit-testable. The host (player1)
 * simulates authoritatively and broadcasts ~10 snapshots/s; the guest
 * sends paddle input and renders interpolated snapshots. Field is
 * 100×60 units; player1 defends the left edge.
 */

export const FIELD_W = 100;
export const FIELD_H = 60;
export const PADDLE_H = 14;
export const PADDLE_X1 = 4;
export const PADDLE_X2 = FIELD_W - 4;
export const BALL_R = 1.4;
export const WIN_POINTS = 7;
export const TIME_CAP_MS = 90_000;
export const BASE_SPEED = 46; // units/sec
export const MAX_SPEED = 82;
/** Speed multiplier applied on every paddle hit. */
export const SPEEDUP = 1.045;
export const SERVE_DELAY_MS = 900;

export interface PongState {
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  p1Y: number;
  p2Y: number;
  score1: number;
  score2: number;
  /** Ball frozen until this simulation time (ms) after a point. */
  serveAtMs: number;
  serveIndex: number;
  done: boolean;
}

export function initialPongState(seed: number): PongState {
  return {
    ballX: FIELD_W / 2,
    ballY: FIELD_H / 2,
    ...serveVelocity(seed, 0),
    p1Y: FIELD_H / 2,
    p2Y: FIELD_H / 2,
    score1: 0,
    score2: 0,
    serveAtMs: SERVE_DELAY_MS,
    serveIndex: 0,
    done: false,
  };
}

/** Deterministic serve direction per point, from the round seed. */
export function serveVelocity(seed: number, serveIndex: number): { vx: number; vy: number } {
  const rng = mulberry32(seed + serveIndex * 7919);
  const angle = (rng() * 0.6 - 0.3) * Math.PI; // within ±54° of horizontal
  const towardP1 = serveIndex % 2 === 0;
  const speed = BASE_SPEED;
  return {
    vx: Math.cos(angle) * speed * (towardP1 ? -1 : 1),
    vy: Math.sin(angle) * speed,
  };
}

export interface StepEvents {
  scored: 1 | 2 | null;
  paddleHit: boolean;
  wallHit: boolean;
}

/**
 * Advance the simulation. `nowMs` is elapsed sim time; paddle positions
 * are supplied by the caller (host input + last-known guest input).
 */
export function stepPong(
  state: PongState,
  dtSec: number,
  nowMs: number,
  seed: number,
  paddleH: number = PADDLE_H,
): StepEvents {
  const events: StepEvents = { scored: null, paddleHit: false, wallHit: false };
  if (state.done || nowMs < state.serveAtMs) return events;

  state.ballX += state.vx * dtSec;
  state.ballY += state.vy * dtSec;

  // Top/bottom walls.
  if (state.ballY < BALL_R) {
    state.ballY = BALL_R * 2 - state.ballY;
    state.vy = Math.abs(state.vy);
    events.wallHit = true;
  } else if (state.ballY > FIELD_H - BALL_R) {
    state.ballY = 2 * (FIELD_H - BALL_R) - state.ballY;
    state.vy = -Math.abs(state.vy);
    events.wallHit = true;
  }

  // Paddles: reflect + spin from hit offset, small speedup.
  const tryPaddle = (paddleX: number, paddleY: number, movingLeft: boolean) => {
    const withinX = movingLeft
      ? state.ballX - BALL_R <= paddleX + 1 && state.ballX > paddleX - 2
      : state.ballX + BALL_R >= paddleX - 1 && state.ballX < paddleX + 2;
    if (!withinX) return false;
    const offset = (state.ballY - paddleY) / (paddleH / 2);
    if (Math.abs(offset) > 1.15) return false;
    const speed = Math.min(MAX_SPEED, Math.hypot(state.vx, state.vy) * SPEEDUP);
    const bounce = Math.max(-0.95, Math.min(0.95, offset)) * 0.75 * Math.PI * 0.5;
    state.vx = Math.cos(bounce) * speed * (movingLeft ? 1 : -1);
    state.vy = Math.sin(bounce) * speed;
    state.ballX = movingLeft ? paddleX + 1 + BALL_R : paddleX - 1 - BALL_R;
    return true;
  };

  if (state.vx < 0 && tryPaddle(PADDLE_X1, state.p1Y, true)) {
    events.paddleHit = true;
  } else if (state.vx > 0 && tryPaddle(PADDLE_X2, state.p2Y, false)) {
    events.paddleHit = true;
  }

  // Goals.
  if (state.ballX < -BALL_R * 2) {
    state.score2 += 1;
    events.scored = 2;
    resetForServe(state, nowMs, seed);
  } else if (state.ballX > FIELD_W + BALL_R * 2) {
    state.score1 += 1;
    events.scored = 1;
    resetForServe(state, nowMs, seed);
  }

  if (state.score1 >= WIN_POINTS || state.score2 >= WIN_POINTS) {
    state.done = true;
  }
  return events;
}

function resetForServe(state: PongState, nowMs: number, seed: number) {
  state.serveIndex += 1;
  state.ballX = FIELD_W / 2;
  state.ballY = FIELD_H / 2;
  const v = serveVelocity(seed, state.serveIndex);
  state.vx = v.vx;
  state.vy = v.vy;
  state.serveAtMs = nowMs + SERVE_DELAY_MS;
}

export function clampPaddle(y: number, paddleH: number = PADDLE_H): number {
  return Math.max(paddleH / 2, Math.min(FIELD_H - paddleH / 2, y));
}

export function pongResult(myPoints: number, theirPoints: number): PlayerResult {
  return {
    rawScore: myPoints,
    normalizedScore: Math.round((myPoints / WIN_POINTS) * 1000) / 10,
    completed: true,
    detail: { points: myPoints, conceded: theirPoints },
  };
}
