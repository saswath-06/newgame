import type { GameDefinition } from "@/types/game";
import { decideMazeWinner } from "./logic";
import { MazeRaceGame } from "./MazeRaceGame";

export const mazeRaceDefinition: GameDefinition = {
  id: "maze-race",
  name: "Maze Race",
  description: "Same maze, two racers. First to the heart wins.",
  icon: "🌀",
  category: "arcade",
  requiresCamera: false,
  estimatedDurationSec: 60,
  component: MazeRaceGame,
  decideWinner: decideMazeWinner,
};
