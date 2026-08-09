import { getSupabase } from "@/lib/supabase";
import { generateRoomCode } from "@/lib/random";
import type { PlayerIdentity, PlayerRole } from "@/types/player";
import type { RoomRow } from "@/types/room";

export type JoinOutcome =
  | { ok: true; room: RoomRow; role: PlayerRole; rejoined: boolean }
  | { ok: false; reason: "not_found" | "full" | "error"; message?: string };

/**
 * Turn a Supabase/network failure into something a player can act on.
 * Raw messages like "TypeError: Failed to fetch" mean nothing to them.
 */
function friendlyError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  if (/failed to fetch|network|timeout|fetch failed/i.test(raw)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (/JWT|api key|unauthorized|permission/i.test(raw)) {
    return "The server rejected the request. Check the Supabase keys in .env.local.";
  }
  if (/relation .* does not exist|schema cache/i.test(raw)) {
    return "The database schema isn't set up yet. Apply the migration in supabase/migrations.";
  }
  return raw || "Something went wrong. Try again.";
}

/** Create a room with a fresh code; creator becomes player1. */
export async function createRoom(me: PlayerIdentity): Promise<JoinOutcome> {
  const supabase = getSupabase();
  // Codes collide astronomically rarely (32^6); retry a couple times anyway.
  // A transient network blip also gets a second chance here.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode();
    try {
      const { data, error } = await supabase
        .from("rooms")
        .insert({
          code,
          status: "waiting",
          player1_id: me.id,
          player1_name: me.name,
        })
        .select()
        .single();
      if (!error && data) {
        return { ok: true, room: data as RoomRow, role: "player1", rejoined: false };
      }
      lastError = error;
      // 23505 is a duplicate code — retry with a fresh one.
      if (error && error.code !== "23505" && !isRetryable(error)) {
        return { ok: false, reason: "error", message: friendlyError(error) };
      }
    } catch (thrown) {
      lastError = thrown;
    }
  }
  return { ok: false, reason: "error", message: friendlyError(lastError) };
}

/** Network-ish failures are worth another attempt; schema errors are not. */
function isRetryable(error: unknown): boolean {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  return /failed to fetch|network|timeout|fetch failed/i.test(raw);
}

/**
 * Join (or rejoin) a room by code. A player whose id already occupies a
 * slot resumes their role — refreshing the page never loses the seat.
 */
export async function joinRoom(
  code: string,
  me: PlayerIdentity,
): Promise<JoinOutcome> {
  const supabase = getSupabase();
  const normalized = code.trim().toUpperCase();
  try {
    const { data: room, error } = await supabase
      .from("rooms")
      .select()
      .eq("code", normalized)
      .maybeSingle();
    if (error) return { ok: false, reason: "error", message: friendlyError(error) };
    if (!room) return { ok: false, reason: "not_found" };

    const row = room as RoomRow;
    if (row.player1_id === me.id) {
      return { ok: true, room: row, role: "player1", rejoined: true };
    }
    if (row.player2_id === me.id) {
      return { ok: true, room: row, role: "player2", rejoined: true };
    }
    if (row.player2_id !== null) {
      return { ok: false, reason: "full" };
    }

    // Claim the empty seat; the filter makes concurrent claims lose cleanly.
    const { data: updated, error: updateError } = await supabase
      .from("rooms")
      .update({ player2_id: me.id, player2_name: me.name, status: "lobby" })
      .eq("id", row.id)
      .is("player2_id", null)
      .select()
      .maybeSingle();
    if (updateError) {
      return { ok: false, reason: "error", message: friendlyError(updateError) };
    }
    if (!updated) return { ok: false, reason: "full" };
    return { ok: true, room: updated as RoomRow, role: "player2", rejoined: false };
  } catch (thrown) {
    return { ok: false, reason: "error", message: friendlyError(thrown) };
  }
}

export async function fetchRoom(code: string): Promise<RoomRow | null> {
  try {
    const { data } = await getSupabase()
      .from("rooms")
      .select()
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();
    return (data as RoomRow) ?? null;
  } catch {
    return null;
  }
}
