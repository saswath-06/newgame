import type { GameDefinition } from "@/types/game";
import { decideMoveSyncWinner } from "./logic";
import { MoveSyncGame } from "./MoveSyncGame";

export const moveSyncDefinition: GameDefinition = {
  id: "move-sync",
  name: "Move Sync",
  description: "Hit a short choreography on the beat. Timing counts.",
  icon: "🕺",
  category: "physical",
  requiresCamera: true,
  estimatedDurationSec: 55,
  component: MoveSyncGame,
  decideWinner: decideMoveSyncWinner,
};
