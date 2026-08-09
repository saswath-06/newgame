import type { GameDefinition } from "@/types/game";
import type { MatchMode } from "@/types/match";
import { mulberry32, pick } from "@/lib/random";
import { quickdrawDefinition } from "@/games/quickdraw";

/**
 * Central game registry. Adding a game = implement GameDefinition in
 * /games/<id>/ and list it here; the lobby, match controller, and results
 * screens pick it up automatically.
 */
const GAMES: GameDefinition[] = [quickdrawDefinition];

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
 * eligible when cameras are available (none registered yet).
 */
export function selectGames(
  mode: MatchMode,
  seed: number,
  camerasAvailable: boolean,
): string[] {
  const pool = GAMES.filter((g) => camerasAvailable || !g.requiresCamera);
  if (pool.length === 0) throw new Error("No games available");
  const rng = mulberry32(seed);
  const count = 2 * targetWinsForMode(mode) - 1;
  const picks: string[] = [];
  for (let i = 0; i < count; i++) {
    let candidate = pick(rng, pool);
    if (pool.length > 1 && picks[i - 1] === candidate.id) {
      candidate = pick(
        rng,
        pool.filter((g) => g.id !== picks[i - 1]),
      );
    }
    picks.push(candidate.id);
  }
  return picks;
}
