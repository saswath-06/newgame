import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  PAIR_COUNT,
  createBoard,
  decideMemoryWinner,
  memoryResult,
} from "@/games/memory-blitz/logic";
import {
  COLOR_KEYS,
  PROMPT_COUNT,
  colorClashResult,
  createPrompts,
  isCorrect,
} from "@/games/color-clash/logic";
import {
  BUTTON_COUNT,
  MAX_LEVEL,
  createSequence,
  decideSequenceWinner,
  sequenceResult,
} from "@/games/sequence-showdown/logic";
import {
  MAZE_HEIGHT,
  MAZE_WIDTH,
  bfsDistances,
  canMove,
  decideMazeWinner,
  generateMaze,
  mazeResult,
  progressToward,
} from "@/games/maze-race/logic";
import {
  FIELD_H,
  PADDLE_H,
  WIN_POINTS,
  clampPaddle,
  initialPongState,
  pongResult,
  serveVelocity,
  stepPong,
} from "@/games/heart-pong/logic";

describe("memory blitz", () => {
  it("builds a deterministic board of matched pairs", () => {
    const a = createBoard(42);
    const b = createBoard(42);
    expect(a).toEqual(b);
    expect(a).toHaveLength(BOARD_SIZE);
    const counts = new Map<string, number>();
    for (const card of a) counts.set(card.emoji, (counts.get(card.emoji) ?? 0) + 1);
    expect(counts.size).toBe(PAIR_COUNT);
    for (const n of counts.values()) expect(n).toBe(2);
    expect(createBoard(43)).not.toEqual(a);
  });

  it("scores completion above non-completion and rewards speed", () => {
    const fastClear = memoryResult(PAIR_COUNT, 25_000, 2);
    const slowClear = memoryResult(PAIR_COUNT, 70_000, 10);
    const partial = memoryResult(5, 90_000, 4);
    expect(fastClear.completed).toBe(true);
    expect(fastClear.normalizedScore).toBeGreaterThan(slowClear.normalizedScore);
    expect(slowClear.normalizedScore).toBeGreaterThan(partial.normalizedScore);
    expect(partial.completed).toBe(false);
  });

  it("first finisher wins; mistakes tiebreak equal times", () => {
    const quick = memoryResult(PAIR_COUNT, 30_000, 5);
    const slow = memoryResult(PAIR_COUNT, 45_000, 0);
    expect(decideMemoryWinner(quick, slow)).toBe("player1");
    expect(decideMemoryWinner(slow, quick)).toBe("player2");
    const cleanSameTime = memoryResult(PAIR_COUNT, 30_000, 1);
    expect(decideMemoryWinner(cleanSameTime, quick)).toBe("player1");
    expect(decideMemoryWinner(quick, memoryResult(4, 90_000, 3))).toBe("player1");
  });
});

describe("color clash", () => {
  it("generates deterministic prompts with valid colors", () => {
    const a = createPrompts(7);
    expect(a).toEqual(createPrompts(7));
    expect(a).toHaveLength(PROMPT_COUNT);
    for (const p of a) {
      expect(COLOR_KEYS).toContain(p.word);
      expect(COLOR_KEYS).toContain(p.ink);
    }
    // Mostly incongruent.
    const incongruent = a.filter((p) => p.word !== p.ink).length;
    expect(incongruent).toBeGreaterThan(PROMPT_COUNT / 2);
  });

  it("judges ink, not word", () => {
    const prompt = { word: "blue" as const, ink: "red" as const };
    expect(isCorrect(prompt, { choice: "red", reactionMs: 500 })).toBe(true);
    expect(isCorrect(prompt, { choice: "blue", reactionMs: 500 })).toBe(false);
    expect(isCorrect(prompt, { choice: null, reactionMs: 2500 })).toBe(false);
  });

  it("punishes random clicking below careful play", () => {
    const prompts = createPrompts(11);
    const careful = colorClashResult(
      prompts,
      prompts.map((p) => ({ choice: p.ink, reactionMs: 900 })),
    );
    // Random clicking: ~25% accuracy at speed.
    const random = colorClashResult(
      prompts,
      prompts.map((p, i) => ({
        choice: COLOR_KEYS[i % 4],
        reactionMs: 200,
      })),
    );
    expect(careful.normalizedScore).toBeGreaterThan(random.normalizedScore * 2);
    expect(careful.rawScore).toBe(PROMPT_COUNT);
  });
});

describe("sequence showdown", () => {
  it("creates a deterministic sequence without long runs", () => {
    const a = createSequence(99);
    expect(a).toEqual(createSequence(99));
    expect(a).toHaveLength(MAX_LEVEL);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(BUTTON_COUNT);
    }
    for (let i = 2; i < a.length; i++) {
      expect(a[i] === a[i - 1] && a[i] === a[i - 2]).toBe(false);
    }
  });

  it("longer level always outranks faster inputs", () => {
    const deep = sequenceResult(8, 1400);
    const shallowFast = sequenceResult(5, 300);
    expect(deep.normalizedScore).toBeGreaterThan(shallowFast.normalizedScore);
    expect(decideSequenceWinner(deep, shallowFast)).toBe("player1");
    expect(decideSequenceWinner(sequenceResult(5, 300), sequenceResult(5, 800))).toBe(
      "player1",
    );
    expect(decideSequenceWinner(sequenceResult(5, 500), sequenceResult(5, 500))).toBeNull();
  });
});

describe("maze race", () => {
  it("generates a deterministic, fully-connected maze", () => {
    const a = generateMaze(1234);
    const b = generateMaze(1234);
    expect(Array.from(a.walls)).toEqual(Array.from(b.walls));
    expect(a.width).toBe(MAZE_WIDTH);
    expect(a.height).toBe(MAZE_HEIGHT);

    const dist = bfsDistances(a, 0, 0);
    for (let i = 0; i < dist.length; i++) expect(dist[i]).toBeGreaterThanOrEqual(0);

    const c = generateMaze(1235);
    expect(Array.from(c.walls)).not.toEqual(Array.from(a.walls));
  });

  it("respects walls in movement", () => {
    const maze = generateMaze(555);
    // Out of bounds is never allowed.
    expect(canMove(maze, 0, 0, -1, 0)).toBe(false);
    expect(canMove(maze, 0, 0, 0, -1)).toBe(false);
    // Every legal move is symmetric with the destination cell.
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        if (canMove(maze, x, y, 1, 0)) expect(canMove(maze, x + 1, y, -1, 0)).toBe(true);
        if (canMove(maze, x, y, 0, 1)) expect(canMove(maze, x, y + 1, 0, -1)).toBe(true);
      }
    }
  });

  it("progress rises toward the goal and finish beats progress", () => {
    const maze = generateMaze(42);
    const goalX = maze.width - 1;
    const goalY = maze.height - 1;
    const distToGoal = bfsDistances(maze, goalX, goalY);
    const startDist = distToGoal[0];
    expect(startDist).toBeGreaterThan(0);
    expect(progressToward(distToGoal, startDist, 0, 0, maze.width)).toBe(0);
    expect(progressToward(distToGoal, startDist, goalX, goalY, maze.width)).toBe(1);

    const done = mazeResult(true, 40_000, 1);
    const almost = mazeResult(false, 90_000, 0.9);
    expect(decideMazeWinner(done, almost)).toBe("player1");
    expect(decideMazeWinner(mazeResult(true, 30_000, 1), done)).toBe("player1");
    expect(decideMazeWinner(almost, mazeResult(false, 90_000, 0.4))).toBe("player1");
  });
});

describe("heart pong", () => {
  it("serves deterministically per seed and point", () => {
    expect(serveVelocity(9, 0)).toEqual(serveVelocity(9, 0));
    expect(serveVelocity(9, 0)).not.toEqual(serveVelocity(9, 1));
    // Serves alternate sides.
    expect(serveVelocity(9, 0).vx).toBeLessThan(0);
    expect(serveVelocity(9, 1).vx).toBeGreaterThan(0);
  });

  it("bounces off top and bottom walls", () => {
    const s = initialPongState(3);
    s.serveAtMs = 0;
    s.ballY = 2;
    s.vy = -40;
    s.vx = 10;
    const ev = stepPong(s, 0.05, 1000, 3);
    expect(ev.wallHit).toBe(true);
    expect(s.vy).toBeGreaterThan(0);
    expect(s.ballY).toBeGreaterThanOrEqual(0);
  });

  it("scores when the ball exits and freezes until the next serve", () => {
    const s = initialPongState(3);
    s.serveAtMs = 0;
    s.ballX = 1;
    s.ballY = FIELD_H / 2;
    s.vx = -60;
    s.vy = 0;
    s.p1Y = 55; // paddle far away from the ball path
    const ev = stepPong(s, 0.2, 1000, 3);
    expect(ev.scored).toBe(2);
    expect(s.score2).toBe(1);
    expect(s.serveAtMs).toBeGreaterThan(1000);
    // Frozen during serve delay.
    const beforeX = s.ballX;
    stepPong(s, 0.1, 1100, 3);
    expect(s.ballX).toBe(beforeX);
  });

  it("a defended ball bounces back instead of scoring", () => {
    const s = initialPongState(3);
    s.serveAtMs = 0;
    s.ballX = 8;
    s.ballY = 30;
    s.vx = -50;
    s.vy = 0;
    s.p1Y = 30;
    const ev = stepPong(s, 0.1, 1000, 3);
    expect(ev.paddleHit).toBe(true);
    expect(ev.scored).toBeNull();
    expect(s.vx).toBeGreaterThan(0);
  });

  it("ends at WIN_POINTS and clamps paddles", () => {
    const s = initialPongState(3);
    s.score1 = WIN_POINTS - 1;
    s.serveAtMs = 0;
    s.ballX = 101;
    s.vx = 60;
    stepPong(s, 0.05, 1000, 3);
    expect(s.score1).toBe(WIN_POINTS);
    expect(s.done).toBe(true);

    expect(clampPaddle(-10)).toBe(PADDLE_H / 2);
    expect(clampPaddle(999)).toBe(FIELD_H - PADDLE_H / 2);

    const win = pongResult(7, 3);
    const lose = pongResult(3, 7);
    expect(win.normalizedScore).toBe(100);
    expect(win.normalizedScore).toBeGreaterThan(lose.normalizedScore);
  });
});
