"use client";

import type { ConnectionQuality } from "@/types/room";

const LABELS: Record<ConnectionQuality, { label: string; className: string }> = {
  excellent: { label: "Excellent", className: "bg-go" },
  good: { label: "Good", className: "bg-peach" },
  poor: { label: "Poor", className: "bg-danger" },
  disconnected: { label: "Disconnected", className: "bg-muted" },
};

export function ConnectionDot({ quality }: { quality: ConnectionQuality }) {
  const { label, className } = LABELS[quality];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        className={`h-2 w-2 rounded-full ${className} ${
          quality === "disconnected" ? "" : "animate-pulse-soft"
        }`}
      />
      {label}
    </span>
  );
}
