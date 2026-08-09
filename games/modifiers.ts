import { mulberry32, pick } from "@/lib/random";
import type { MatchMode } from "@/types/match";

/**
 * Chaos-mode modifiers. A modifier is a tag carried in the match config;
 * generic ones (double_points) are applied by the match machine, and
 * game-specific ones are honored by games that opt in via GameProps.
 */

export interface ModifierDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Game ids this modifier applies to; empty = any game. */
  appliesTo: string[];
}

export const MODIFIERS: ModifierDefinition[] = [
  {
    id: "double_points",
    name: "Double Points",
    description: "This round's crown counts twice.",
    icon: "✨",
    appliesTo: [],
  },
  {
    id: "faster_timer",
    name: "Hyper Speed",
    description: "The clock shows no mercy.",
    icon: "⏱️",
    appliesTo: ["quickdraw", "color-clash"],
  },
  {
    id: "tiny_paddles",
    name: "Tiny Paddles",
    description: "Half the paddle, twice the panic.",
    icon: "🤏",
    appliesTo: ["heart-pong"],
  },
  {
    id: "mirrored_controls",
    name: "Mirrored Controls",
    description: "Left is right. Up is down. Good luck.",
    icon: "🪞",
    appliesTo: ["maze-race"],
  },
];

export function getModifier(id: string): ModifierDefinition | null {
  return MODIFIERS.find((m) => m.id === id) ?? null;
}

/** Chance that any given Chaos round carries a modifier. */
const CHAOS_MODIFIER_CHANCE = 0.5;

/**
 * Deterministically assign at most one modifier per round. Only Chaos
 * rounds get modifiers; every other mode gets empty arrays.
 */
export function assignModifiers(
  mode: MatchMode,
  seed: number,
  games: string[],
): string[][] {
  if (mode !== "chaos") return games.map(() => []);
  const rng = mulberry32(seed ^ 0x5eeded);
  return games.map((gameId) => {
    if (rng() >= CHAOS_MODIFIER_CHANCE) return [];
    const eligible = MODIFIERS.filter(
      (m) => m.appliesTo.length === 0 || m.appliesTo.includes(gameId),
    );
    if (eligible.length === 0) return [];
    return [pick(rng, eligible).id];
  });
}
