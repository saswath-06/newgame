# DuoArcade

A private online arcade for two. Join the same room with a
6-character code, ready up, and compete in short synchronized minigames —
crowns for the winner, shared Couple XP for both.

**Current status:** the full arcade loop is playable end-to-end:

```
Landing → Create/Join room → Lobby → Ready up → synchronized minigames
→ Round results → Match results (best of 3) → Rematch
```

**Six arcade games** are live: ⚡ Quickdraw, 🧠 Memory Blitz, 🎨 Color Clash,
🟣 Sequence Showdown, 🌀 Maze Race, and 💗 Heart Pong (host-authoritative
realtime pong), plus the first **camera game**, 🤸 Pose Perfect.

### Devices without a camera

Camera games are kept out of match selection **entirely** unless *both*
players have a webcam — detected with `enumerateDevices`, which needs no
permission prompt, and exchanged over a `CAMERA_STATUS` event. The lobby says
why when they're unavailable. If a camera fails mid-match, the affected player
can ask their partner to skip that round; once both agree, the round resolves
as a draw and the match continues.

**All four match modes** work. The host picks in the lobby and the choice
syncs to both players:

| Mode | Length | Behavior |
|---|---|---|
| Quick Match | Best of 3 | Random games each round |
| Date Night | Best of 7 | Balances arcade/physical categories (falls back to arcade until camera games ship) |
| Chaos Mode | Best of 9 | Rounds can carry a modifier — see below |
| Custom | Best of 1–7 | Host picks the length and which games are in the pool |

### Chaos modifiers

Roughly half of Chaos rounds draw one modifier, assigned deterministically
from the match seed so both clients agree. Add new ones in
`games/modifiers.ts`; each declares which games it applies to.

- **✨ Double Points** — the round's crown counts twice (applied by the match machine, works with every game)
- **⏱️ Hyper Speed** — much tighter answer window (Quickdraw, Color Clash)
- **🤏 Tiny Paddles** — paddles shrink to 55% (Heart Pong)
- **🪞 Mirrored Controls** — every direction inverts (Maze Race)

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
hooks/useVision.ts       Camera + MediaPipe lifecycle; landmarks land in a ref
lib/vision/              Pose/gesture math, engine wrapper, camera manager
components/vision/       Camera feed with skeleton overlay, calibration screen
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

### How pose scoring works

Everything runs **on-device** via MediaPipe Tasks Vision (WebAssembly). Camera
frames are never uploaded, nothing is recorded, and landmark streams are
discarded when a game ends.

- `lib/vision/camera.ts` owns a **single refcounted MediaStream**, so MediaPipe
  and (later) the WebRTC call share one camera instead of competing for it.
- `lib/vision/engine.ts` wraps the Pose and Hand landmarkers, tries the **GPU
  delegate and falls back to CPU**, and runs detection on `requestAnimationFrame`.
  The WASM runtime is served from `public/mediapipe/` — copied out of
  `node_modules` by `scripts/copy-mediapipe-wasm.mjs` before dev/build, so it
  always matches the installed version and works offline.
- `useVision` writes smoothed landmarks into a **ref, not state**, so games can
  sample at 60fps without re-rendering React each frame.
- Scoring compares **joint angles and relative geometry, never raw pixels**.
  `normalizePose` recenters on the body and divides by torso length, so camera
  distance, height, and position in frame don't affect the score. Landmarks
  below 0.5 visibility are ignored rather than penalized.
- `comparePoses` blends a weighted joint average with the **worst single joint**,
  so a pose that gets the "free" joints right (straight legs, straight elbows)
  but holds the arms completely wrong can't score well.
- `mirrorAngles` swaps left/right and flips lean, which is what makes Mirror Me
  scoreable.
- Gestures (`lib/vision/gestures.ts`) are pure geometry — a finger is extended
  when its tip is farther from the wrist than its middle joint, scaled by hand
  size. `GestureStabilizer` requires several consecutive confident frames so a
  hand passing through a shape doesn't count.

- Thresholds for "did they move?" and "are they wobbling?" are **self-calibrating**
  (`lib/vision/calibration.ts`). A cheap webcam in dim light jitters several times
  more than a good sensor, so a number measured on one machine doesn't transfer.
  Each player samples their own noise floor while holding still, and thresholds
  derive from that — clamped so neither a suspiciously quiet nor a very noisy
  camera makes a game impossible or trivial.

Every algorithm takes plain landmark arrays, so the unit tests build synthetic
bodies and hands (`tests/unit/vision-fixtures.ts`) and never touch MediaPipe.

**Debug it live:** `npm run dev`, then visit **/dev/vision** for a skeleton
overlay, live joint angles vs. a target template, motion/sway readouts, and
gesture detection. Development builds only.

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
npx playwright test      # two-context e2e + vision smoke test (needs
                         # .env.local; first run: npx playwright install chromium)
```

Deterministic logic (seeded RNG, match transitions, winner resolution,
Quickdraw scoring, event validation) is unit-tested without any network or
browser. The e2e suite drives two real browser contexts through the entire
loop, including a rematch.

## Deployment

Any Next.js host works (Vercel is simplest): set the two `NEXT_PUBLIC_SUPABASE_*`
env vars, apply the migration to the production Supabase project, deploy.
No server-side secrets exist yet — the anon key is public by design.

## Privacy

Pose and hand detection run MediaPipe **entirely in your browser**. Camera
frames are never uploaded for scoring, nothing is recorded, and landmark data
is discarded when a game ends. Peer video (Phase 6) will travel peer-to-peer
over WebRTC.

## Known limitations

- Date Night's category balancing has nothing to balance yet — all six games
  are arcade, so it currently behaves like a longer Quick Match.
- Only the host picks the match mode; the guest sees the selection but
  can't change it.
- Heart Pong's guest paddle rides on broadcast latency (~100–300 ms) — fine
  for casual play, noticeable on slow connections.
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

Phase 4 (vision foundation) is **done**. Phase 5 is **in progress** — Pose
Perfect is playable; Freeze, Balance Battle, Hand Sign Sprint, Mirror Me and
Move Sync are next. Then Phase 6: WebRTC video call → Phase 7: stakes,
cosmetics, richer stats and dynamic titles.

The camera games' detection heuristics have been validated against synthetic
landmark data, but **not yet tuned against a real body on a real webcam** —
expect the similarity and movement thresholds to need a pass once someone
plays them for real. `/dev/vision` exists for exactly that.
