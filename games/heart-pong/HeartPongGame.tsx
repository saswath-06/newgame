"use client";

import { useEffect, useRef, useState } from "react";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  PADDLE_H,
  PADDLE_X1,
  PADDLE_X2,
  TIME_CAP_MS,
  WIN_POINTS,
  clampPaddle,
  initialPongState,
  pongResult,
  stepPong,
} from "./logic";

const SCALE = 7; // canvas px per field unit
const SNAPSHOT_MS = 100;
const INPUT_SEND_MS = 100;
const PADDLE_SPEED = 58; // units/sec via keyboard

/**
 * Host (player1) simulates authoritatively and broadcasts ~10 snapshots/s;
 * the guest sends paddle positions and renders smoothed snapshots. Each
 * player sees their own paddle on the LEFT in their color.
 */
export function HeartPongGame({
  seed,
  role,
  playerName,
  partnerName,
  startAt,
  now,
  modifiers,
  sendGameEvent,
  onGameEvent,
  onFinish,
  partnerResult,
}: GameProps) {
  const isHost = role === "player1";
  const paddleH = modifiers.includes("tiny_paddles") ? PADDLE_H * 0.55 : PADDLE_H;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scores, setScores] = useState({ mine: 0, theirs: 0 });
  const [done, setDone] = useState(false);

  const simRef = useRef(initialPongState(seed));
  const myYRef = useRef(FIELD_H / 2);
  const peerYRef = useRef(FIELD_H / 2);
  const keysRef = useRef({ up: false, down: false });
  const finishedRef = useRef(false);
  // Guest render state, smoothed toward the latest snapshot.
  const viewRef = useRef({
    bx: FIELD_W / 2,
    by: FIELD_H / 2,
    hostY: FIELD_H / 2,
    guestY: FIELD_H / 2,
    s1: 0,
    s2: 0,
    done: false,
  });

  // Inbound events: host reads guest paddle; guest reads snapshots.
  useEffect(() => {
    return onGameEvent((payload) => {
      if (isHost) {
        if (typeof payload.gy === "number") {
          peerYRef.current = clampPaddle(payload.gy, paddleH);
        }
        return;
      }
      if (typeof payload.bx === "number" && typeof payload.by === "number") {
        const v = viewRef.current;
        const s1 = typeof payload.s1 === "number" ? payload.s1 : v.s1;
        const s2 = typeof payload.s2 === "number" ? payload.s2 : v.s2;
        if (s2 > v.s2) soundManager.play("point");
        else if (s1 > v.s1) soundManager.play("incorrect");
        v.bx = payload.bx;
        v.by = payload.by;
        v.hostY = typeof payload.p1 === "number" ? payload.p1 : v.hostY;
        v.s1 = s1;
        v.s2 = s2;
        v.done = Boolean(payload.done);
        setScores({ mine: s2, theirs: s1 });
        if (v.done && !finishedRef.current) {
          finishedRef.current = true;
          setDone(true);
          onFinish(pongResult(s2, s1));
        }
      }
    });
  }, [onGameEvent, isHost, onFinish, paddleH]);

  // Shared input: keyboard + pointer drag on the canvas.
  useEffect(() => {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") {
        keysRef.current.up = down;
        e.preventDefault();
      }
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        keysRef.current.down = down;
        e.preventDefault();
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const canvas = canvasRef.current;
    const onPointer = (e: PointerEvent) => {
      if (!canvas || (e.buttons === 0 && e.pointerType === "mouse")) return;
      const rect = canvas.getBoundingClientRect();
      const y = ((e.clientY - rect.top) / rect.height) * FIELD_H;
      myYRef.current = clampPaddle(y, paddleH);
    };
    canvas?.addEventListener("pointermove", onPointer);
    canvas?.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvas?.removeEventListener("pointermove", onPointer);
      canvas?.removeEventListener("pointerdown", onPointer);
    };
  }, [paddleH]);

  // Main loop.
  useEffect(() => {
    let raf = 0;
    let lastTick = now();
    let lastSnapshot = 0;
    let lastInputSend = 0;

    const loop = () => {
      const t = now();
      const dt = Math.min(0.05, Math.max(0, (t - lastTick) / 1000));
      lastTick = t;
      const simNow = t - startAt;

      // Keyboard paddle movement (both sides).
      if (keysRef.current.up)
        myYRef.current = clampPaddle(myYRef.current - PADDLE_SPEED * dt, paddleH);
      if (keysRef.current.down)
        myYRef.current = clampPaddle(myYRef.current + PADDLE_SPEED * dt, paddleH);

      if (isHost) {
        const sim = simRef.current;
        if (simNow >= 0 && !sim.done) {
          sim.p1Y = myYRef.current;
          sim.p2Y = peerYRef.current;
          const events = stepPong(sim, dt, simNow, seed, paddleH);
          if (events.paddleHit) soundManager.play("click");
          if (events.scored === 1) soundManager.play("point");
          if (events.scored === 2) soundManager.play("incorrect");
          if (simNow >= TIME_CAP_MS) sim.done = true;
          setScores((prev) =>
            prev.mine !== sim.score1 || prev.theirs !== sim.score2
              ? { mine: sim.score1, theirs: sim.score2 }
              : prev,
          );
        }
        if (t - lastSnapshot >= SNAPSHOT_MS || (sim.done && !finishedRef.current)) {
          lastSnapshot = t;
          sendGameEvent({
            bx: sim.ballX,
            by: sim.ballY,
            p1: sim.p1Y,
            s1: sim.score1,
            s2: sim.score2,
            done: sim.done,
          });
        }
        if (sim.done && !finishedRef.current) {
          finishedRef.current = true;
          setDone(true);
          onFinish(pongResult(sim.score1, sim.score2));
        }
        drawFrame(canvasRef.current, {
          bx: sim.ballX,
          by: sim.ballY,
          leftY: sim.p1Y,
          rightY: sim.p2Y,
          mirror: false,
          frozen: simNow < sim.serveAtMs,
          role,
          paddleH,
        });
      } else {
        // Guest: smooth toward the latest snapshot; own paddle is local.
        const v = viewRef.current;
        if (t - lastInputSend >= INPUT_SEND_MS) {
          lastInputSend = t;
          sendGameEvent({ gy: myYRef.current });
        }
        v.guestY = myYRef.current;
        drawFrame(canvasRef.current, {
          bx: FIELD_W - v.bx, // mirrored: guest defends the left
          by: v.by,
          leftY: v.guestY,
          rightY: v.hostY,
          mirror: true,
          frozen: false,
          role,
          paddleH,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isHost, now, startAt, seed, sendGameEvent, onFinish, role, paddleH]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div className="flex w-full max-w-2xl items-center justify-between font-display text-sm font-bold">
        <span className={role === "player1" ? "text-rose" : "text-violet-soft"}>
          {playerName} · {scores.mine}
        </span>
        <span className="text-xs font-medium text-muted">first to {WIN_POINTS}</span>
        <span className={role === "player1" ? "text-violet-soft" : "text-rose"}>
          {scores.theirs} · {partnerName}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        width={FIELD_W * SCALE}
        height={FIELD_H * SCALE}
        className="w-full max-w-2xl touch-none rounded-xl border border-edge bg-bg/60"
      />
      <p className="text-xs text-muted">
        {done
          ? partnerResult
            ? "Scoring…"
            : `Waiting for ${partnerName}…`
          : "W/S, arrows, or drag to move your paddle (left side)"}
      </p>
    </div>
  );
}

interface FrameView {
  bx: number;
  by: number;
  leftY: number;
  rightY: number;
  mirror: boolean;
  frozen: boolean;
  role: "player1" | "player2";
  paddleH: number;
}

function drawFrame(canvas: HTMLCanvasElement | null, view: FrameView) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Center line + heart.
  ctx.strokeStyle = "rgba(139, 147, 184, 0.25)";
  ctx.setLineDash([8, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "28px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.25;
  ctx.fillText("💗", canvas.width / 2, canvas.height / 2);
  ctx.globalAlpha = 1;

  const myColor = view.role === "player1" ? "#FF4D7D" : "#8B5CF6";
  const theirColor = view.role === "player1" ? "#8B5CF6" : "#FF4D7D";
  const paddle = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    const px = x * SCALE;
    const py = (y - view.paddleH / 2) * SCALE;
    ctx.beginPath();
    ctx.roundRect(px - 5, py, 10, view.paddleH * SCALE, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
  };
  paddle(view.mirror ? FIELD_W - PADDLE_X2 : PADDLE_X1, view.leftY, myColor);
  paddle(view.mirror ? FIELD_W - PADDLE_X1 : PADDLE_X2, view.rightY, theirColor);

  // Ball.
  ctx.fillStyle = "#FFB86B";
  ctx.shadowColor = "#FFB86B";
  ctx.shadowBlur = view.frozen ? 4 : 16;
  ctx.beginPath();
  ctx.arc(view.bx * SCALE, view.by * SCALE, BALL_R * SCALE, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}
