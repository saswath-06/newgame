export type RoomStatus =
  | "waiting"
  | "lobby"
  | "in_match"
  | "complete"
  | "abandoned";

/** Shape of a row in the `rooms` table. */
export interface RoomRow {
  id: string;
  code: string;
  status: RoomStatus;
  player1_id: string | null;
  player1_name: string | null;
  player2_id: string | null;
  player2_name: string | null;
  created_at: string;
}

export type ConnectionQuality = "excellent" | "good" | "poor" | "disconnected";
