export type PlayerRole = "player1" | "player2";

export interface PlayerIdentity {
  id: string;
  name: string;
}

export interface RoomPlayer extends PlayerIdentity {
  role: PlayerRole;
}

export function otherRole(role: PlayerRole): PlayerRole {
  return role === "player1" ? "player2" : "player1";
}
