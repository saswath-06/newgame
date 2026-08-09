import type { ConnectionQuality } from "@/types/room";

/**
 * Peer clock sync over broadcast ping/pong.
 *
 * The host is the time authority: countdown startAt values are host-clock
 * epoch ms. The guest estimates offset = hostClock − localClock from pong
 * samples (best = lowest RTT, NTP-style) and corrects with now().
 * The host's own offset is always 0.
 */

export interface ClockSample {
  rttMs: number;
  offsetMs: number;
  at: number;
}

const MAX_SAMPLES = 8;
/** Partner counts as disconnected after this long without a pong/presence. */
const STALE_MS = 12000;

export class ClockSync {
  private samples: ClockSample[] = [];
  private pending = new Map<number, number>(); // nonce -> local sentAt
  private nextNonce = 1;
  private lastHeardAt = 0;
  readonly isAuthority: boolean;

  constructor(isAuthority: boolean) {
    this.isAuthority = isAuthority;
  }

  /** Create a ping payload; remember when it left. */
  createPing(from: string): { type: "PING"; from: string; nonce: number; sentAt: number } {
    const nonce = this.nextNonce++;
    const sentAt = Date.now();
    this.pending.set(nonce, sentAt);
    // Bound memory if pongs never arrive.
    if (this.pending.size > 32) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
    return { type: "PING", from, nonce, sentAt };
  }

  /** Record a pong: peerAt is the peer's local clock when it replied. */
  recordPong(nonce: number, peerAt: number): void {
    const sentAt = this.pending.get(nonce);
    this.pending.delete(nonce);
    this.lastHeardAt = Date.now();
    if (sentAt === undefined) return;
    const nowMs = Date.now();
    const rttMs = nowMs - sentAt;
    // Peer stamped mid-flight; assume symmetric latency.
    const offsetMs = peerAt + rttMs / 2 - nowMs;
    this.samples.push({ rttMs, offsetMs, at: nowMs });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** Note any inbound traffic from the peer (keeps quality fresh). */
  heardFromPeer(): void {
    this.lastHeardAt = Date.now();
  }

  /** Offset (peerClock − localClock) from the lowest-RTT recent sample. */
  offsetMs(): number {
    if (this.isAuthority || this.samples.length === 0) return 0;
    const best = this.samples.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));
    return best.offsetMs;
  }

  /** Host-aligned epoch ms. */
  now(): number {
    return Date.now() + this.offsetMs();
  }

  quality(partnerPresent: boolean): ConnectionQuality {
    if (!partnerPresent) return "disconnected";
    if (this.lastHeardAt === 0 || Date.now() - this.lastHeardAt > STALE_MS) {
      return this.samples.length === 0 ? "good" : "poor";
    }
    const recent = this.samples.slice(-4);
    if (recent.length === 0) return "good";
    const avgRtt = recent.reduce((a, s) => a + s.rttMs, 0) / recent.length;
    if (avgRtt < 120) return "excellent";
    if (avgRtt < 350) return "good";
    return "poor";
  }
}
