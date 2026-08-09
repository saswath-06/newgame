import type { GameDefinition } from "@/types/game";
import type { MatchMode } from "@/types/match";
import { mulberry32, pick } from "@/lib/random";
import { quickdrawDefinition } from "@/games/quickdraw";
import { memoryBlitzDefinition } from "@/games/memory-blitz";
import { colorClashDefinition } from "@/games/color-clash";
import { sequenceShowdownDefinition } from "@/games/sequence-showdown";
import { mazeRaceDefinition } from "@/games/maze-race";
import { heartPongDefinition } from "@/games/heart-pong";
import { posePerfectDefinition } from "@/games/pose-perfect";
import { freezeDefinition } from "@/games/freeze";
import { balanceBattleDefinition } from "@/games/balance-battle";
import { handSignSprintDefinition } from "@/games/hand-sign-sprint";
import { mirrorMeDefinition } from "@/games/mirror-me";
import { moveSyncDefinition } from "@/games/move-sync";

/**
 * Central game registry. Adding a game = implement GameDefinition in
 * /games/<id>/ and list it here; the lobby, match controller, and results
 * screens pick it up automatically.
 */
const GAMES: GameDefinition[] = [
  quickdrawDefinition,
  memoryBlitzDefinition,
  colorClashDefinition,
  sequenceShowdownDefinition,
  mazeRaceDefinition,
  heartPongDefinition,
  posePerfectDefinition,
  freezeDefinition,
  balanceBattleDefinition,
  handSignSprintDefinition,
  mirrorMeDefinition,
  moveSyncDefinition,
];

export function getGame(id: string): GameDefinition | null {
  return GAMES.find((g) => g.id === id) ?? null;
}

export function listGames(): GameDefinition[] {
  return [...GAMES];
}

export function targetWinsForMode(mode: MatchMode): number {
  switch (mode) {
    case "quick":
      return 2; // best of 3
    case "date_night":
      return 4; // best of 7
    case "chaos":
      return 5; // best of 9
    case "custom":
      return 2;
  }
}

/**
 * Pick one game id per potential round. Deterministic per seed; avoids
 * back-to-back repeats when the pool allows it. Physical games are only
 * eligible when cameras are available (none registered yet). Date Night
 * aims for a ~50/50 arcade/physical balance once physical games exist.
 * Custom mode restricts the pool to the host's selection.
 */
export function selectGames(
  mode: MatchMode,
  seed: number,
  camerasAvailable: boolean,
  customGameIds?: string[],
  customTargetWins?: number,
): string[] {
  let pool = GAMES.filter((g) => camerasAvailable || !g.requiresCamera);
  if (mode === "custom" && customGameIds && customGameIds.length > 0) {
    const customPool = pool.filter((g) => customGameIds.includes(g.id));
    if (customPool.length > 0) pool = customPool;
  }
  // Dev/e2e override: force specific games via sessionStorage, e.g.
  // sessionStorage["duoarcade:forceGames"] = "quickdraw". Never in prod.
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    try {
      const forced = window.sessionStorage.getItem("duoarcade:forceGames");
      if (forced) {
        const ids = forced.split(",").map((s) => s.trim());
        const forcedPool = GAMES.filter((g) => ids.includes(g.id));
        if (forcedPool.length > 0) pool = forcedPool;
      }
    } catch {
      // storage unavailable — ignore
    }
  }
  if (pool.length === 0) throw new Error("No games available");
  const rng = mulberry32(seed);
  const targetWins =
    mode === "custom" && customTargetWins ? customTargetWins : targetWinsForMode(mode);
  const count = 2 * targetWins - 1;

  // Date Night balances categories; when a category pool is empty
  // (no cameras yet), it degrades to whatever is available.
  const arcade = pool.filter((g) => g.category === "arcade");
  const physical = pool.filter((g) => g.category === "physical");
  const balanced = mode === "date_night" && arcade.length > 0 && physical.length > 0;

  const picks: string[] = [];
  let arcadePicks = 0;
  let physicalPicks = 0;
  for (let i = 0; i < count; i++) {
    let candidates = pool;
    if (balanced) {
      candidates =
        arcadePicks === physicalPicks
          ? rng() < 0.5
            ? arcade
            : physical
          : arcadePicks < physicalPicks
            ? arcade
            : physical;
    }
    let candidate = pick(rng, candidates);
    if (candidates.length > 1 && picks[i - 1] === candidate.id) {
      candidate = pick(
        rng,
        candidates.filter((g) => g.id !== picks[i - 1]),
      );
    }
    picks.push(candidate.id);
    if (candidate.category === "arcade") arcadePicks += 1;
    else physicalPicks += 1;
  }
  return picks;
}
