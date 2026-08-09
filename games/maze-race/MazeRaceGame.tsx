"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { soundManager } from "@/lib/sound";
import type { GameProps } from "@/types/game";
import {
  TIME_CAP_MS,
  bfsDistances,
  canMove,
  generateMaze,
  mazeResult,
  progressToward,
} from "./logic";

const CELL = 40;
const PROGRESS_SEND_MS = 400;

export function MazeRaceGame({
  seed,
  playerName,
  partnerName,
  role,
  startAt,
  now,
  modifiers,
  sendGameEvent,
  onGameEvent,
  onFinish,
  partnerResult,
}: GameProps) {
  const maze = useMemo(() => generateMaze(seed), [seed]);
  const mirrored = modifiers.includes("mirrored_controls");
  const goal = { x: maze.width - 1, y: maze.height - 1 };
  const distToGoal = useMemo(() => bfsDistances(maze, goal.x, goal.y), [maze, goal.x, goal.y]);
  const startDist = distToGoal[0];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const finishedRef = useRef(false);
  const lastSentRef = useRef(0);
  const [done, setDone] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [myProgress, setMyProgress] = useState(0);
  const [partnerProgress, setPartnerProgress] = useState(0);

  const myColor = role === "player1" ? "#FF4D7D" : "#8B5CF6";

  useEffect(() => {
    return onGameEvent((payload) => {
      if (typeof payload.progress === "number") {
        setPartnerProgress(Math.max(0, Math.min(1, payload.progress)));
      }
    });
  }, [onGameEvent]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height, walls } = maze;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Cells + walls.
    ctx.strokeStyle = "rgba(139, 147, 184, 0.55)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const w = walls[y * width + x];
        const px = x * CELL;
        const py = y * CELL;
        if (w & 1) { ctx.moveTo(px, py); ctx.lineTo(px + CELL, py); }
        if (w & 2) { ctx.moveTo(px + CELL, py); ctx.lineTo(px + CELL, py + CELL); }
        if (w & 4) { ctx.moveTo(px, py + CELL); ctx.lineTo(px + CELL, py + CELL); }
        if (w & 8) { ctx.moveTo(px, py); ctx.lineTo(px, py + CELL); }
      }
    }
    ctx.stroke();

    // Goal heart.
    ctx.font = `${CELL * 0.6}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💗", (goal.x + 0.5) * CELL, (goal.y + 0.55) * CELL);

    // Player dot.
    const { x, y } = posRef.current;
    ctx.fillStyle = myColor;
    ctx.shadowColor = myColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [maze, goal.x, goal.y, myColor]);

  useEffect(() => {
    draw();
  }, [draw]);

  const finish = useCallback(
    (reached: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setDone(true);
      const elapsed = Math.min(TIME_CAP_MS, now() - startAt);
      const progress = progressToward(
        distToGoal,
        startDist,
        posRef.current.x,
        posRef.current.y,
        maze.width,
      );
      if (reached) soundManager.play("point");
      onFinish(mazeResult(reached, elapsed, reached ? 1 : progress));
    },
    [now, startAt, onFinish, distToGoal, startDist, maze.width],
  );

  const move = useCallback(
    (dx: number, dy: number) => {
      if (finishedRef.current) return;
      const { x, y } = posRef.current;
      if (!canMove(maze, x, y, dx, dy)) return;
      posRef.current = { x: x + dx, y: y + dy };
      draw();
      const progress = progressToward(
        distToGoal,
        startDist,
        posRef.current.x,
        posRef.current.y,
        maze.width,
      );
      setMyProgress(progress);
      const t = now();
      if (t - lastSentRef.current > PROGRESS_SEND_MS) {
        lastSentRef.current = t;
        sendGameEvent({ progress });
      }
      if (posRef.current.x === goal.x && posRef.current.y === goal.y) {
        sendGameEvent({ progress: 1 });
        finish(true);
      }
    },
    [maze, draw, distToGoal, startDist, now, sendGameEvent, goal.x, goal.y, finish],
  );

  // Keyboard: arrows + WASD (auto-repeat gives held-key movement).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -1], KeyW: [0, -1],
        ArrowDown: [0, 1], KeyS: [0, 1],
        ArrowLeft: [-1, 0], KeyA: [-1, 0],
        ArrowRight: [1, 0], KeyD: [1, 0],
      };
      const dir = map[e.code];
      if (dir) {
        e.preventDefault();
        // Mirrored Controls modifier: every direction is inverted.
        const flip = mirrored ? -1 : 1;
        move(dir[0] * flip, dir[1] * flip);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, mirrored]);

  // Clock + cap.
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = now() - startAt;
      setElapsedSec(Math.max(0, Math.floor(elapsed / 1000)));
      if (elapsed >= TIME_CAP_MS) finish(false);
    }, 250);
    return () => clearInterval(timer);
  }, [now, startAt, finish]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div className="flex w-full max-w-2xl items-center justify-between text-sm">
        <span className="font-display font-bold" style={{ color: myColor }}>
          {playerName}
        </span>
        <span className="text-muted">
          {elapsedSec}s · arrows / WASD{mirrored && " · 🪞 INVERTED"}
        </span>
        <span className="font-display font-bold text-violet-soft">
          {partnerName} {partnerResult ? "· finished!" : ""}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        width={maze.width * CELL}
        height={maze.height * CELL}
        className="max-h-[60vh] w-full max-w-2xl rounded-xl"
        style={{ aspectRatio: `${maze.width} / ${maze.height}` }}
      />

      {/* Partner ghost: distance only, never their route. */}
      <div className="w-full max-w-2xl">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted">
          <span>You {Math.round(myProgress * 100)}%</span>
          <span>
            {partnerName} {Math.round((partnerResult ? 1 : partnerProgress) * 100)}%
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet to-rose"
            animate={{ width: `${(partnerResult ? 1 : partnerProgress) * 100}%` }}
          />
        </div>
      </div>

      {/* Touch D-pad. */}
      {!done && (
        <div className="grid grid-cols-3 gap-1 sm:hidden">
          <span />
          <DPad label="▲" onPress={() => move(0, mirrored ? 1 : -1)} />
          <span />
          <DPad label="◀" onPress={() => move(mirrored ? 1 : -1, 0)} />
          <DPad label="▼" onPress={() => move(0, mirrored ? -1 : 1)} />
          <DPad label="▶" onPress={() => move(mirrored ? -1 : 1, 0)} />
        </div>
      )}

      {done && (
        <p className="animate-pulse-soft text-sm text-muted">
          {partnerResult ? "Scoring…" : `Waiting for ${partnerName}…`}
        </p>
      )}
    </div>
  );
}

function DPad({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      onPointerDown={onPress}
      className="h-12 w-14 cursor-pointer rounded-xl border border-edge bg-raised text-lg text-ink active:bg-white/10"
      aria-label={`Move ${label}`}
    >
      {label}
    </button>
  );
}
