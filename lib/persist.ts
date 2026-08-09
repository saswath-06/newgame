import { getSupabase } from "@/lib/supabase";
import type { MatchConfig, MatchState } from "@/types/match";
import type { RoomPlayer } from "@/types/player";
import type { RoundOutcome } from "@/types/game";

/**
 * Persistence of final results only — invoked by the host at match end.
 * Realtime gameplay never touches Postgres (spec §24). All writes are
 * best-effort: a failed insert must never break the match UI.
 */

export const XP_PER_MINIGAME = 10;
export const XP_PER_MATCH = 50;

export interface PersistedMatchSummary {
  coupleXpEarned: number;
  coupleXpTotal: number | null;
  totalMatches: number | null;
}

function sortedPair(a: RoomPlayer, b: RoomPlayer): [RoomPlayer, RoomPlayer] {
  return a.id < b.id ? [a, b] : [b, a];
}

async function findOrCreateCouple(
  p1: RoomPlayer,
  p2: RoomPlayer,
): Promise<string | null> {
  const supabase = getSupabase();
  const [a, b] = sortedPair(p1, p2);
  const { data: existing } = await supabase
    .from("couples")
    .select("id")
    .eq("player_a_id", a.id)
    .eq("player_b_id", b.id)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await supabase
    .from("couples")
    .insert({
      player_a_id: a.id,
      player_b_id: b.id,
      player_a_name: a.name,
      player_b_name: b.name,
    })
    .select("id")
    .maybeSingle();
  return (created?.id as string) ?? null;
}

/** Write the completed match, its rounds, and updated couple stats. */
export async function persistCompletedMatch(args: {
  roomId: string;
  config: MatchConfig;
  state: MatchState;
  player1: RoomPlayer;
  player2: RoomPlayer;
}): Promise<PersistedMatchSummary | null> {
  const { roomId, config, state, player1, player2 } = args;
  try {
    const supabase = getSupabase();
    const coupleId = await findOrCreateCouple(player1, player2);
    const winnerPlayerId =
      state.matchWinner === "player1"
        ? player1.id
        : state.matchWinner === "player2"
          ? player2.id
          : null;

    const { data: match } = await supabase
      .from("matches")
      .insert({
        room_id: roomId,
        couple_id: coupleId,
        mode: config.mode,
        target_wins: config.targetWins,
        seed: config.seed,
        status: "complete",
        winner_player_id: winnerPlayerId,
        score: state.crowns,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (match) {
      const rows = state.outcomes.map((o: RoundOutcome) => ({
        match_id: match.id,
        round_number: o.round,
        game_id: o.gameId,
        winner_player_id:
          o.winnerRole === "player1"
            ? player1.id
            : o.winnerRole === "player2"
              ? player2.id
              : null,
        player1_raw_score: o.results.player1.rawScore,
        player1_normalized_score: o.results.player1.normalizedScore,
        player2_raw_score: o.results.player2.rawScore,
        player2_normalized_score: o.results.player2.normalizedScore,
        detail: {
          player1: o.results.player1.detail ?? {},
          player2: o.results.player2.detail ?? {},
        },
      }));
      if (rows.length > 0) await supabase.from("game_results").insert(rows);
    }

    if (!coupleId) return null;
    return await updateCoupleStats(coupleId, state, player1, player2);
  } catch {
    return null;
  }
}

async function updateCoupleStats(
  coupleId: string,
  state: MatchState,
  player1: RoomPlayer,
  player2: RoomPlayer,
): Promise<PersistedMatchSummary | null> {
  const supabase = getSupabase();
  const [a] = sortedPair(player1, player2);
  const winnerIsA =
    state.matchWinner === null
      ? null
      : (state.matchWinner === "player1" ? player1.id : player2.id) === a.id;

  const xpEarned = XP_PER_MATCH + state.outcomes.length * XP_PER_MINIGAME;

  const { data: existing } = await supabase
    .from("couple_stats")
    .select()
    .eq("couple_id", coupleId)
    .maybeSingle();

  const prevStreak = (existing?.current_streak as number) ?? 0;
  // Signed streak: positive runs belong to player_a, negative to player_b.
  const nextStreak =
    winnerIsA === null
      ? prevStreak
      : winnerIsA
        ? prevStreak > 0
          ? prevStreak + 1
          : 1
        : prevStreak < 0
          ? prevStreak - 1
          : -1;

  const next = {
    couple_id: coupleId,
    total_matches: ((existing?.total_matches as number) ?? 0) + 1,
    total_minigames:
      ((existing?.total_minigames as number) ?? 0) + state.outcomes.length,
    player_a_match_wins:
      ((existing?.player_a_match_wins as number) ?? 0) + (winnerIsA === true ? 1 : 0),
    player_b_match_wins:
      ((existing?.player_b_match_wins as number) ?? 0) + (winnerIsA === false ? 1 : 0),
    current_streak: nextStreak,
    longest_streak: Math.max(
      (existing?.longest_streak as number) ?? 0,
      Math.abs(nextStreak),
    ),
    couple_xp: ((existing?.couple_xp as number) ?? 0) + xpEarned,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("couple_stats").upsert(next);
  return {
    coupleXpEarned: xpEarned,
    coupleXpTotal: next.couple_xp,
    totalMatches: next.total_matches,
  };
}
