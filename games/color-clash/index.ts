import type { GameDefinition } from "@/types/game";
import { ColorClashGame } from "./ColorClashGame";

export const colorClashDefinition: GameDefinition = {
  id: "color-clash",
  name: "Color Clash",
  description: "The word lies. Tap the ink color before the clock does.",
  icon: "🎨",
  category: "arcade",
  requiresCamera: false,
  estimatedDurationSec: 55,
  component: ColorClashGame,
  // Default normalizedScore comparison — accuracy & speed baked into it.
};
