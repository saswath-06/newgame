# DuoArcade ♥

A private online arcade for two. Long-distance couples join the same room with a
6-character code, ready up, and compete in short synchronized minigames —
crowns for the winner, shared Couple XP for both.

**Current status:** the foundation vertical slice is playable end-to-end:

```
Landing → Create/Join room → Lobby → Ready up → synchronized Quickdraw
→ Round results → Match results (best of 3) → Rematch
```

Persistent stats (matches, rounds, Couple XP, rivalry streak) are written to
Supabase after every match.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** (strict) · **Tailwind CSS 4**
- **Supabase** — Postgres for persistent results, Realtime channels
  (broadcast + presence) for multiplayer
- **framer-motion** for transitions, **WebAudio** for synthesized sound (no assets)
- **Vitest** (unit) · **Playwright** (two-context e2e)

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev                  # http://localhost:3000
```

### Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy the **Project URL** and **anon key**
   into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
3. Apply the schema — either:
   - **SQL editor:** paste `supabase/migrations/0001_foundation.sql` into the
     dashboard SQL editor and run it, or
   - **CLI:** `npx supabase login`, `npx supabase link --project-ref <ref>`,
     then `npx supabase db push`.

No auth setup is needed — the MVP uses a guest flow (display name only).
The schema reserves `auth_user_id` columns for adding Supabase Auth later.

### Playing locally with two windows

Player identity is stored in **sessionStorage**, so every browser **tab** is a
distinct player:

1. `npm run dev`, open http://localhost:3000 in one tab → enter a name →
   **Create room**.
2. Click the big room code to copy the invite link, open it in a **second tab
   or window** (same browser is fine) → enter a different name → **Enter room**.
3. Both tabs click **Ready up** → synchronized countdown → play.

A **dev panel** (bottom-right `dev` button, development builds only) shows live
room/match state and can drive a solo match: *Solo quickdraw* starts a round
without a partner, *Fake partner result* resolves it.

## Architecture

```
app/                     Landing, /room/[code] (whole match flow), dev panel host
components/lobby|game|ui Presentational components per area
games/registry.ts        GameDefinition registry + mode-based selection
games/quickdraw/         logic.ts (pure, tested) + QuickdrawGame.tsx (rendering)
hooks/useRoomSession.ts  Join/rejoin, realtime channel, presence, clock sync
hooks/useMatch.ts        Match controller: reducer + host duties + results
lib/realtime/            Typed channel wrapper, ping/pong clock sync
lib/match/               Pure state machine, winner resolution, highlights
lib/random.ts            Seeded RNG (xmur3 + mulberry32), room codes
lib/persist.ts           Post-match persistence (matches, results, couple stats)
supabase/migrations/     Schema
tests/unit, tests/e2e    Vitest + Playwright
```

### How multiplayer synchronization works

- One Supabase Realtime channel per room (`room:<CODE>`). **Presence** tracks
  who is online; **broadcast** carries a discriminated-union `RoomEvent`
  (`types/events.ts`), validated by `parseRoomEvent` before anything reacts.
- Both clients run the same **pure match reducer** (`lib/match/machine.ts`)
  over the same event stream, so they stay in lockstep.
- **Player 1 is the host**: it makes the non-deterministic calls (match config,
  seeds, countdown `startAt` timestamps) and broadcasts them. Round winners are
  computed *independently on both clients* from the exchanged `GAME_RESULT`s —
  deterministic, so no arbitration is needed.
- **Clock sync:** clients exchange ping/pong to estimate offset to the host
  clock (lowest-RTT sample, NTP-style). Countdowns target a shared future
  `startAt`; each client renders against its offset-corrected clock. RTT also
  drives the connection-quality indicator.
- **Determinism:** game content derives from `roundSeed(matchSeed, round)` via
  a seeded PRNG, so both clients generate identical rounds (Quickdraw delays
  today; mazes, card layouts, Simon sequences later). Only low-frequency events
  cross the network — never animation frames.
- **Reconnection:** identity lives in sessionStorage; rejoining a room with the
  same id resumes the seat. The rejoiner requests a `STATE_SNAPSHOT` from the
  partner and hydrates the reducer. A mid-round rejoiner concedes that round
  (incomplete result) rather than desyncing.

### Scoring

Every game reports `{ rawScore, normalizedScore (0–100), completed }` per
player. The round winner earns a **crown**; first to the mode's target wins the
match. Normalized scores are used for stats and tiebreaks — never summed to
decide a match. Both players earn shared **Couple XP** (+10 per minigame,
+50 per match), which only ever goes up.

## Adding a new game

1. Create `games/<id>/logic.ts` with pure, seed-driven logic (unit-testable —
   no React, no network) and `games/<id>/<Name>Game.tsx` implementing the
   `GameProps` contract from `types/game.ts`:

```ts
// games/coinflip/index.ts
import type { GameDefinition } from "@/types/game";
import { CoinflipGame } from "./CoinflipGame";

export const coinflipDefinition: GameDefinition = {
  id: "coinflip",
  name: "Coinflip",
  description: "Call it in the air.",
  icon: "🪙",
  category: "arcade",
  requiresCamera: false,
  estimatedDurationSec: 20,
  component: CoinflipGame,
  // optional: custom decideWinner(p1, p2) — defaults to normalizedScore
};
```

2. Register it in `games/registry.ts` (`GAMES` array). Mode selection, the
   countdown, result screens, crowns, and persistence all pick it up
   automatically.
3. Inside the component: derive content from `seed`, run gameplay against
   `startAt`/`now()` (synced clock), exchange low-frequency updates with
   `sendGameEvent`/`onGameEvent`, and call `onFinish(result)` exactly once.

## Testing

```bash
npm test                 # Vitest unit tests (RNG, machine, quickdraw, events)
npm run typecheck        # tsc --noEmit
npx eslint .             # lint
npx playwright test      # two-context e2e (needs .env.local + first run:
                         #   npx playwright install chromium)
```

Deterministic logic (seeded RNG, match transitions, winner resolution,
Quickdraw scoring, event validation) is unit-tested without any network or
browser. The e2e suite drives two real browser contexts through the entire
loop, including a rematch.

## Deployment

Any Next.js host works (Vercel is simplest): set the two `NEXT_PUBLIC_SUPABASE_*`
env vars, apply the migration to the production Supabase project, deploy.
No server-side secrets exist yet — the anon key is public by design.

## Privacy (for upcoming camera phases)

Planned computer-vision games run MediaPipe **entirely in the browser**;
camera frames are never uploaded for scoring, and peer video (when added) will
travel peer-to-peer over WebRTC.

## Known limitations

- Only **Quick Match** (best of 3) and one game (Quickdraw) exist; other modes
  are visible but marked "coming soon".
- RLS is intentionally permissive (guest flow, anon key). Fine for a private
  couples game; tighten when Supabase Auth lands.
- If **both** players close their tabs mid-match, the match state is gone
  (by design — only final results persist). The room itself survives.
- Broadcast delivery is at-most-once; Quickdraw self-heals by sending
  cumulative reaction arrays, but an extremely lossy connection can still
  produce odd sub-round displays.
- No TURN server: WebRTC (Phase 6) will need one for strict NATs; the ICE
  config placeholder is in `.env.example`.

## Roadmap

Phase 3: Memory Blitz, Color Clash, Sequence Showdown, Maze Race, Heart Pong →
Phase 4: MediaPipe vision foundation → Phase 5: six physical games →
Phase 6: WebRTC video call → Phase 7: stakes, cosmetics, richer stats & titles.
