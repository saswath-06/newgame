import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { parseRoomEvent, type RoomEvent } from "@/types/events";

export interface PresenceMeta {
  playerId: string;
  name: string;
  role: "player1" | "player2";
  [key: string]: unknown;
}

export type ChannelStatus = "connecting" | "connected" | "error" | "closed";

type EventHandler = (event: RoomEvent) => void;
type PresenceHandler = (online: PresenceMeta[]) => void;
type StatusHandler = (status: ChannelStatus) => void;

/**
 * Typed wrapper around one Supabase Realtime channel per room.
 * All broadcasts travel as a single "room" event whose payload is a
 * RoomEvent; incoming payloads are validated before reaching handlers.
 */
export class RoomChannel {
  private channel: RealtimeChannel;
  private eventHandlers = new Set<EventHandler>();
  private presenceHandlers = new Set<PresenceHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private meta: PresenceMeta;
  status: ChannelStatus = "connecting";

  constructor(roomCode: string, meta: PresenceMeta) {
    this.meta = meta;
    this.channel = getSupabase().channel(`room:${roomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: meta.playerId },
      },
    });

    this.channel.on("broadcast", { event: "room" }, ({ payload }) => {
      const event = parseRoomEvent(payload);
      if (!event) return;
      for (const h of this.eventHandlers) h(event);
    });

    const emitPresence = () => {
      const state = this.channel.presenceState<PresenceMeta>();
      const online: PresenceMeta[] = Object.values(state)
        .flat()
        .filter((p) => typeof p.playerId === "string")
        .map((p) => ({ playerId: p.playerId, name: p.name, role: p.role }));
      for (const h of this.presenceHandlers) h(online);
    };
    this.channel.on("presence", { event: "sync" }, emitPresence);
    this.channel.on("presence", { event: "join" }, emitPresence);
    this.channel.on("presence", { event: "leave" }, emitPresence);
  }

  /** Subscribe and start tracking presence. Resolves once connected. */
  join(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          this.setStatus("connected");
          await this.channel.track(this.meta);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.setStatus("error");
          reject(new Error(`Realtime channel ${status}`));
        } else if (status === "CLOSED") {
          this.setStatus("closed");
        }
      });
    });
  }

  send(event: RoomEvent): void {
    void this.channel.send({ type: "broadcast", event: "room", payload: event });
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(status: ChannelStatus) {
    this.status = status;
    for (const h of this.statusHandlers) h(status);
  }

  async leave(): Promise<void> {
    this.eventHandlers.clear();
    this.presenceHandlers.clear();
    this.statusHandlers.clear();
    await getSupabase().removeChannel(this.channel);
  }
}
