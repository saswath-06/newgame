import type { GameDefinition } from "@/types/game";
import { decideFreezeWinner } from "./logic";
import { FreezeGame } from "./FreezeGame";

export const freezeDefinition: GameDefinition = {
  id: "freeze",
  name: "Freeze!",
  description: "Dance while it says MOVE — then don't twitch.",
  icon: "🧊",
  category: "physical",
  requiresCamera: true,
  estimatedDurationSec: 45,
  component: FreezeGame,
  decideWinner: decideFreezeWinner,
};
