"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { createRoom } from "@/lib/rooms";
import { isValidRoomCode } from "@/lib/random";
import { isSupabaseConfigured } from "@/lib/supabase";
import { soundManager } from "@/lib/sound";

type Panel = "create" | "join";

export default function LandingPage() {
  const router = useRouter();
  const { claimIdentity, prefillName } = usePlayerIdentity();
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [panel, setPanel] = useState<Panel>("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NEXT_PUBLIC_ vars are inlined at build time — same on server and client.
  const configured = isSupabaseConfigured();
  const name = nameInput ?? prefillName;
  const nameOk = name.trim().length >= 1;

  async function handleCreate() {
    if (!nameOk || busy) return;
    setBusy(true);
    setError(null);
    const me = claimIdentity(name);
    const outcome = await createRoom(me);
    if (outcome.ok) {
      soundManager.play("join");
      router.push(`/room/${outcome.room.code}`);
    } else {
      setError(outcome.message ?? "Could not create a room. Try again.");
      setBusy(false);
    }
  }

  function handleJoin() {
    if (!nameOk || busy) return;
    const normalized = code.trim().toUpperCase();
    if (!isValidRoomCode(normalized)) {
      setError("Room codes are 6 letters and numbers, like KX7PQ4.");
      return;
    }
    setError(null);
    claimIdentity(name);
    soundManager.play("join");
    router.push(`/room/${normalized}`);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-xl text-center"
      >
        <p className="font-display text-xs font-medium uppercase tracking-[0.35em] text-muted">
          A private arcade for two
        </p>
        <h1 className="mt-4 font-display text-6xl font-extrabold leading-none sm:text-7xl">
          <span className="text-gradient-duo glow-rose">Duo</span>
          <span className="text-ink">Arcade</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted">
          Share a room code with your favorite person, ready up, and settle who&apos;s
          better at everything — one minigame at a time.
        </p>

        {!configured && (
          <div className="glass mx-auto mt-8 max-w-md rounded-2xl px-5 py-4 text-left text-sm text-peach">
            Supabase isn&apos;t configured yet. Copy{" "}
            <code className="text-ink">.env.example</code> to{" "}
            <code className="text-ink">.env.local</code>, add your project URL and
            anon key, then restart the dev server.
          </div>
        )}

        <div className="glass mx-auto mt-10 w-full max-w-md rounded-3xl p-6 text-left">
          <label htmlFor="name" className="text-sm font-medium text-muted">
            Your name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={24}
            placeholder="What should your partner call you?"
            className="mt-2 w-full rounded-xl border border-edge bg-raised px-4 py-3 text-ink placeholder:text-muted/60 focus:border-rose/60 focus:outline-none"
            autoComplete="off"
          />

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-raised p-1">
            {(["create", "join"] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPanel(p);
                  setError(null);
                }}
                className={`cursor-pointer rounded-lg py-2 font-display text-sm font-semibold transition-colors ${
                  panel === p ? "bg-white/10 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {p === "create" ? "Create room" : "Join room"}
              </button>
            ))}
          </div>

          {panel === "create" ? (
            <div className="mt-5">
              <Button
                size="lg"
                className="w-full"
                disabled={!nameOk || busy || !configured}
                onClick={handleCreate}
              >
                {busy ? "Creating room…" : "Create a room"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted">
                You&apos;ll get a 6-character code to send to your partner.
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                maxLength={6}
                placeholder="ROOM CODE"
                aria-label="Room code"
                className="w-full rounded-xl border border-edge bg-raised px-4 py-3 text-center font-display text-2xl font-bold tracking-[0.4em] text-ink placeholder:text-base placeholder:font-body placeholder:tracking-normal placeholder:text-muted/60 focus:border-violet/60 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                size="lg"
                className="mt-3 w-full"
                disabled={!nameOk || code.trim().length !== 6 || !configured}
                onClick={handleJoin}
              >
                Join room
              </Button>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </div>

        <p className="mt-10 text-xs text-muted/70">
          Built for exactly two players. No accounts, no downloads — just a code.
        </p>
      </motion.div>
    </main>
  );
}
