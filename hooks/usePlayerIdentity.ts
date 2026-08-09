"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { PlayerIdentity } from "@/types/player";

/**
 * Guest identity. The id lives in sessionStorage so each browser TAB is a
 * distinct player — two tabs on one machine can face off (and it's how the
 * dev/e2e two-window flow works). The display name is mirrored to
 * localStorage purely as a convenient prefill for the next session.
 */

const SESSION_KEY = "duoarcade:player";
const NAME_PREFILL_KEY = "duoarcade:name";

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Snapshot cache keyed by the raw string so getSnapshot stays referentially
// stable (required by useSyncExternalStore).
let cachedRaw: string | null = null;
let cachedIdentity: PlayerIdentity | null = null;

function readIdentity(): PlayerIdentity | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedIdentity;
  cachedRaw = raw;
  cachedIdentity = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (typeof parsed.id === "string" && typeof parsed.name === "string") {
        cachedIdentity = { id: parsed.id, name: parsed.name };
      }
    } catch {
      cachedIdentity = null;
    }
  }
  return cachedIdentity;
}

function readPrefill(): string {
  try {
    return window.localStorage.getItem(NAME_PREFILL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function usePlayerIdentity() {
  const identity = useSyncExternalStore(subscribe, readIdentity, () => null);
  const prefillName = useSyncExternalStore(subscribe, readPrefill, () => "");

  const claimIdentity = useCallback((name: string): PlayerIdentity => {
    const trimmed = name.trim().slice(0, 24);
    const existing = readIdentity();
    const next: PlayerIdentity = {
      id: existing?.id ?? crypto.randomUUID(),
      name: trimmed,
    };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    try {
      window.localStorage.setItem(NAME_PREFILL_KEY, trimmed);
    } catch {
      // prefill is best-effort
    }
    for (const l of listeners) l();
    return next;
  }, []);

  return { identity, prefillName, claimIdentity };
}
