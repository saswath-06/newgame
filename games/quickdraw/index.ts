import type { GameDefinition } from "@/types/game";
import { decideQuickdrawWinner } from "./logic";
import { QuickdrawGame } from "./QuickdrawGame";

export const quickdrawDefinition: GameDefinition = {
  id: "quickdraw",
  name: "Quickdraw",
  description: "Wait for the signal… then click faster than your partner.",
  icon: "⚡",
  category: "arcade",
  requiresCamera: false,
  estimatedDurationSec: 45,
  component: QuickdrawGame,
  decideWinner: decideQuickdrawWinner,
};
