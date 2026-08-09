import type { GameDefinition } from "@/types/game";
import { decideMemoryWinner } from "./logic";
import { MemoryBlitzGame } from "./MemoryBlitzGame";

export const memoryBlitzDefinition: GameDefinition = {
  id: "memory-blitz",
  name: "Memory Blitz",
  description: "Race to clear the same pair board before your partner.",
  icon: "🧠",
  category: "arcade",
  requiresCamera: false,
  estimatedDurationSec: 60,
  component: MemoryBlitzGame,
  decideWinner: decideMemoryWinner,
};
