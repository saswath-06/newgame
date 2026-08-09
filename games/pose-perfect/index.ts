import type { GameDefinition } from "@/types/game";
import { PosePerfectGame } from "./PosePerfectGame";

export const posePerfectDefinition: GameDefinition = {
  id: "pose-perfect",
  name: "Pose Perfect",
  description: "Match five target poses with your whole body.",
  icon: "🤸",
  category: "physical",
  requiresCamera: true,
  estimatedDurationSec: 60,
  component: PosePerfectGame,
  // Default winner rule: higher normalizedScore (= average similarity).
};
