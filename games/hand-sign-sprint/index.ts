import type { GameDefinition } from "@/types/game";
import { decideHandSignWinner } from "./logic";
import { HandSignSprintGame } from "./HandSignSprintGame";

export const handSignSprintDefinition: GameDefinition = {
  id: "hand-sign-sprint",
  name: "Hand Sign Sprint",
  description: "Race through a run of hand signs. Wrong shapes cost time.",
  icon: "✌️",
  category: "physical",
  requiresCamera: true,
  estimatedDurationSec: 50,
  component: HandSignSprintGame,
  decideWinner: decideHandSignWinner,
};
