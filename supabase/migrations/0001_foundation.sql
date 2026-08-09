-- DuoArcade foundation schema.
-- Rooms are ephemeral coordination points; matches/results/stats persist.
-- High-frequency game state never touches Postgres (Realtime broadcast only).

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 6),
  status text not null default 'waiting'
    check (status in ('waiting', 'lobby', 'in_match', 'complete', 'abandoned')),
  player1_id uuid,
  player1_name text,
  player2_id uuid,
  player2_name text,
  -- Reserved for later Supabase Auth adoption (guest flow for now).
  player1_auth_user_id uuid,
  player2_auth_user_id uuid,
  created_at timestamptz not null default now()
);

create index rooms_code_idx on public.rooms (code);
create index rooms_created_at_idx on public.rooms (created_at);

-- A couple is an unordered pair of player ids (stored sorted for uniqueness),
-- the anchor for all-time shared stats and Couple XP.
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  player_a_id uuid not null,
  player_b_id uuid not null,
  player_a_name text,
  player_b_name text,
  created_at timestamptz not null default now(),
  constraint couples_sorted_pair check (player_a_id < player_b_id),
  constraint couples_unique_pair unique (player_a_id, player_b_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  couple_id uuid references public.couples (id) on delete set null,
  mode text not null check (mode in ('quick', 'date_night', 'chaos', 'custom')),
  target_wins int not null check (target_wins between 1 and 10),
  seed bigint not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'complete', 'abandoned')),
  winner_player_id uuid,
  -- {"player1": 2, "player2": 1} crown totals at completion.
  score jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index matches_room_id_idx on public.matches (room_id);
create index matches_couple_id_idx on public.matches (couple_id);

create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  round_number int not null check (round_number >= 0),
  game_id text not null,
  winner_player_id uuid,
  player1_raw_score double precision not null,
  player1_normalized_score double precision not null
    check (player1_normalized_score between 0 and 100),
  player2_raw_score double precision not null,
  player2_normalized_score double precision not null
    check (player2_normalized_score between 0 and 100),
  -- Game-specific extras (avg reaction ms, mistakes, ...).
  detail jsonb,
  created_at timestamptz not null default now(),
  constraint game_results_unique_round unique (match_id, round_number)
);

create index game_results_match_id_idx on public.game_results (match_id);
create index game_results_game_id_idx on public.game_results (game_id);

create table public.couple_stats (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  total_matches int not null default 0,
  total_minigames int not null default 0,
  player_a_match_wins int not null default 0,
  player_b_match_wins int not null default 0,
  -- Signed streak: positive = player_a on a run, negative = player_b.
  current_streak int not null default 0,
  longest_streak int not null default 0,
  couple_xp int not null default 0,
  updated_at timestamptz not null default now()
);

-- Per-game, per-couple aggregates (personal bests, win rates).
create table public.player_game_stats (
  couple_id uuid not null references public.couples (id) on delete cascade,
  game_id text not null,
  games_played int not null default 0,
  player_a_wins int not null default 0,
  player_b_wins int not null default 0,
  player_a_best double precision,
  player_b_best double precision,
  player_a_score_total double precision not null default 0,
  player_b_score_total double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (couple_id, game_id)
);

-- RLS: enabled with permissive anon policies. This is a casual two-person
-- couples game joined by room code; we intentionally do not build anti-cheat
-- style row security for the guest MVP. Tightens naturally once Supabase
-- Auth profiles are added.
alter table public.rooms enable row level security;
alter table public.couples enable row level security;
alter table public.matches enable row level security;
alter table public.game_results enable row level security;
alter table public.couple_stats enable row level security;
alter table public.player_game_stats enable row level security;

create policy "anon full access" on public.rooms
  for all using (true) with check (true);
create policy "anon full access" on public.couples
  for all using (true) with check (true);
create policy "anon full access" on public.matches
  for all using (true) with check (true);
create policy "anon full access" on public.game_results
  for all using (true) with check (true);
create policy "anon full access" on public.couple_stats
  for all using (true) with check (true);
create policy "anon full access" on public.player_game_stats
  for all using (true) with check (true);
