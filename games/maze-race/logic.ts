import { mulberry32 } from "@/lib/random";
import type { PlayerResult } from "@/types/game";
import type { PlayerRole } from "@/types/player";

/**
 * Maze Race: identical procedural maze for both players (recursive
 * backtracker over the shared seed). First to the finish wins; a partner
 * progress bar shows how close they are without revealing their route.
 */

export const MAZE_WIDTH = 15;
export const MAZE_HEIGHT = 11;
export const TIME_CAP_MS = 90_000;

// Wall bitmask per cell.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export interface Maze {
  width: number;
  height: number;
  /** Wall bitmask per cell, row-major. */
  walls: Uint8Array;
}

const DIRS = [
  { bit: N, opp: S, dx: 0, dy: -1 },
  { bit: E, opp: W, dx: 1, dy: 0 },
  { bit: S, opp: N, dx: 0, dy: 1 },
  { bit: W, opp: E, dx: -1, dy: 0 },
];

export function generateMaze(
  seed: number,
  width = MAZE_WIDTH,
  height = MAZE_HEIGHT,
): Maze {
  const rng = mulberry32(seed);
  const walls = new Uint8Array(width * height).fill(N | E | S | W);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [0];
  visited[0] = 1;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const cx = current % width;
    const cy = Math.floor(current / width);
    const options = DIRS.filter(({ dx, dy }) => {
      const nx = cx + dx;
      const ny = cy + dy;
      return nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny * width + nx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const dir = options[Math.floor(rng() * options.length)];
    const next = (cy + dir.dy) * width + (cx + dir.dx);
    walls[current] &= ~dir.bit;
    walls[next] &= ~dir.opp;
    visited[next] = 1;
    stack.push(next);
  }
  return { width, height, walls };
}

export function canMove(maze: Maze, x: number, y: number, dx: number, dy: number): boolean {
  const dir = DIRS.find((d) => d.dx === dx && d.dy === dy);
  if (!dir) return false;
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || nx >= maze.width || ny < 0 || ny >= maze.height) return false;
  return (maze.walls[y * maze.width + x] & dir.bit) === 0;
}

/** BFS distances from a cell (used for progress %, and in tests). */
export function bfsDistances(maze: Maze, fromX: number, fromY: number): Int32Array {
  const dist = new Int32Array(maze.width * maze.height).fill(-1);
  const queue = [fromY * maze.width + fromX];
  dist[queue[0]] = 0;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const x = cell % maze.width;
    const y = Math.floor(cell / maze.width);
    for (const { bit, dx, dy } of DIRS) {
      if ((maze.walls[cell] & bit) !== 0) continue;
      const next = (y + dy) * maze.width + (x + dx);
      if (dist[next] === -1) {
        dist[next] = dist[cell] + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}

/** 0..1 — how far along the shortest remaining path a player is. */
export function progressToward(
  distToGoal: Int32Array,
  startDist: number,
  x: number,
  y: number,
  width: number,
): number {
  const d = distToGoal[y * width + x];
  if (d < 0 || startDist <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - d / startDist));
}

export function mazeResult(
  finished: boolean,
  timeMs: number,
  progress: number,
): PlayerResult {
  const normalized = finished
    ? Math.max(40, Math.min(100, 100 - (timeMs / 1000 - 20) * 1.2))
    : progress * 35;
  return {
    rawScore: finished ? Math.round(timeMs) : 0,
    normalizedScore: Math.round(normalized * 10) / 10,
    completed: finished,
    detail: { timeMs: Math.round(timeMs), progressPct: Math.round(progress * 100) },
  };
}

export function decideMazeWinner(
  p1: PlayerResult,
  p2: PlayerResult,
): PlayerRole | null {
  if (p1.completed !== p2.completed) return p1.completed ? "player1" : "player2";
  if (p1.completed && p2.completed) {
    const t1 = p1.rawScore;
    const t2 = p2.rawScore;
    if (t1 !== t2) return t1 < t2 ? "player1" : "player2";
    return null;
  }
  const g1 = typeof p1.detail?.progressPct === "number" ? p1.detail.progressPct : 0;
  const g2 = typeof p2.detail?.progressPct === "number" ? p2.detail.progressPct : 0;
  if (g1 !== g2) return g1 > g2 ? "player1" : "player2";
  return null;
}
