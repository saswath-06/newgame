import type { GameDefinition } from "@/types/game";
import { MirrorMeGame } from "./MirrorMeGame";

export const mirrorMeDefinition: GameDefinition = {
  id: "mirror-me",
  name: "Mirror Me",
  description: "One leads, one mirrors — then swap. Highest match wins.",
  icon: "🪞",
  category: "physical",
  requiresCamera: true,
  estimatedDurationSec: 40,
  component: MirrorMeGame,
  // Default rule: higher normalizedScore (= average mirror similarity).
};
