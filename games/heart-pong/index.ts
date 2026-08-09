import type { GameDefinition } from "@/types/game";
import { HeartPongGame } from "./HeartPongGame";

export const heartPongDefinition: GameDefinition = {
  id: "heart-pong",
  name: "Heart Pong",
  description: "Classic paddle duel. First to 7 breaks a heart.",
  icon: "💗",
  category: "arcade",
  requiresCamera: false,
  estimatedDurationSec: 80,
  component: HeartPongGame,
  // Default winner rule: higher normalizedScore (= more points).
};
