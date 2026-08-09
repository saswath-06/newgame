import type { GameDefinition } from "@/types/game";
import { decideBalanceWinner } from "./logic";
import { BalanceBattleGame } from "./BalanceBattleGame";

export const balanceBattleDefinition: GameDefinition = {
  id: "balance-battle",
  name: "Balance Battle",
  description: "One leg up. Hold it longer than they can.",
  icon: "🦩",
  category: "physical",
  requiresCamera: true,
  estimatedDurationSec: 70,
  component: BalanceBattleGame,
  decideWinner: decideBalanceWinner,
};
