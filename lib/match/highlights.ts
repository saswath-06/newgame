import type { RoundOutcome } from "@/types/game";

export interface Highlight {
  icon: string;
  label: string;
  value: string;
}

/** Fun facts for the match result screen, derived from round outcomes. */
export function computeHighlights(
  outcomes: RoundOutcome[],
  names: { player1: string; player2: string },
): Highlight[] {
  const highlights: Highlight[] = [];

  let fastest: { ms: number; who: string } | null = null;
  for (const o of outcomes) {
    for (const role of ["player1", "player2"] as const) {
      const ms = o.results[role].detail?.avgReactionMs;
      if (typeof ms === "number" && ms >= 0 && (!fastest || ms < fastest.ms)) {
        fastest = { ms, who: names[role] };
      }
    }
  }
  if (fastest) {
    highlights.push({
      icon: "⚡",
      label: "Fastest average reaction",
      value: `${Math.round(fastest.ms)} ms — ${fastest.who}`,
    });
  }

  let closest: { round: number; margin: number } | null = null;
  for (const o of outcomes) {
    const margin = Math.abs(
      o.results.player1.normalizedScore - o.results.player2.normalizedScore,
    );
    if (!closest || margin < closest.margin) {
      closest = { round: o.round, margin };
    }
  }
  if (closest && outcomes.length > 1) {
    highlights.push({
      icon: "🤏",
      label: "Closest round",
      value: `Round ${closest.round + 1} — decided by ${closest.margin.toFixed(1)} points`,
    });
  }

  let dominant: { round: number; margin: number; who: string } | null = null;
  for (const o of outcomes) {
    const margin =
      o.results.player1.normalizedScore - o.results.player2.normalizedScore;
    if (!dominant || Math.abs(margin) > Math.abs(dominant.margin)) {
      dominant = {
        round: o.round,
        margin,
        who: margin >= 0 ? names.player1 : names.player2,
      };
    }
  }
  if (dominant && Math.abs(dominant.margin) > 10) {
    highlights.push({
      icon: "💪",
      label: "Most one-sided round",
      value: `Round ${dominant.round + 1} — ${dominant.who} by ${Math.abs(dominant.margin).toFixed(0)}`,
    });
  }

  return highlights;
}
