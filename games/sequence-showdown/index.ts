import type { GameDefinition } from "@/types/game";
import { decideSequenceWinner } from "./logic";
import { SequenceShowdownGame } from "./SequenceShowdownGame";

export const sequenceShowdownDefinition: GameDefinition = {
  id: "sequence-showdown",
  name: "Sequence Showdown",
  description: "Simon says: repeat the growing pattern longer than they can.",
  icon: "🟣",
  category: "arcade",
  requiresCamera: false,
  estimatedDurationSec: 75,
  component: SequenceShowdownGame,
  decideWinner: decideSequenceWinner,
};
