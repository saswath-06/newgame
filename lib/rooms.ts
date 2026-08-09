import { getSupabase } from "@/lib/supabase";
import { generateRoomCode } from "@/lib/random";
import type { PlayerIdentity, PlayerRole } from "@/types/player";
import type { RoomRow } from "@/types/room";

export type JoinOutcome =
  | { ok: true; room: RoomRow; role: PlayerRole; rejoined: boolean }
  | { ok: false; reason: "not_found" | "full" | "error"; message?: string };

/** Create a room with a fresh code; creator becomes player1. */
export async function createRoom(me: PlayerIdentity): Promise<JoinOutcome> {
  const supabase = getSupabase();
  // Codes collide astronomically rarely (32^6); retry a couple times anyway.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode();
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
    if (error && error.code !== "23505") {
      return { ok: false, reason: "error", message: error.message };
    }
  }
  return { ok: false, reason: "error", message: "Could not allocate a room code" };
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
  const { data: room, error } = await supabase
    .from("rooms")
    .select()
    .eq("code", normalized)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", message: error.message };
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
    return { ok: false, reason: "error", message: updateError.message };
  }
  if (!updated) return { ok: false, reason: "full" };
  return { ok: true, room: updated as RoomRow, role: "player2", rejoined: false };
}

export async function fetchRoom(code: string): Promise<RoomRow | null> {
  const { data } = await getSupabase()
    .from("rooms")
    .select()
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  return (data as RoomRow) ?? null;
}
