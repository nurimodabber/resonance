-- Resonance Supabase Schema
-- Run this in your Supabase SQL Editor before deploying to Vercel.

create table if not exists public.cards (
  id text primary key,
  stack_id text not null check (stack_id in ('warmup', 'reflection', 'vulnerability', 'friendship', 'spirituality', 'quotes')),
  kind text not null check (kind in ('question', 'wildcard', 'quote')),
  de text not null,
  en text not null,
  dig_deeper_de text,
  dig_deeper_en text,
  quote_subdeck text check (quote_subdeck in ('general', 'ruhi')),
  ruhi_chapter smallint check (ruhi_chapter in (1, 2, 3)),
  author text,
  source_label_de text,
  source_label_en text,
  source_url_de text,
  source_url_en text,
  prompt_de text,
  prompt_en text,
  archived boolean not null default false,
  is_custom boolean not null default false,
  contributed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_ratings (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  session_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_card_ratings_card_id on public.card_ratings(card_id);

create table if not exists public.group_rooms (
  code text primary key,
  active_stack_ids text[] not null default '{}',
  timer_minutes integer,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.group_submissions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.group_rooms(code) on delete cascade,
  text text not null,
  language text not null check (language in ('de', 'en')),
  author_name text,
  source_card_id text,
  status text not null default 'pending' check (status in ('pending', 'promoted', 'dismissed')),
  promoted_stack_id text check (promoted_stack_id in ('warmup', 'reflection', 'vulnerability', 'friendship', 'spirituality', 'quotes')),
  created_at timestamptz not null default now()
);

create index if not exists idx_group_submissions_room on public.group_submissions(room_code, created_at);

-- Enable Row-Level Security
alter table public.cards enable row level security;
alter table public.card_ratings enable row level security;
alter table public.group_rooms enable row level security;
alter table public.group_submissions enable row level security;

-- Cards: public reads non-archived cards; authenticated admin can read/write all
create policy "Public read active cards"
  on public.cards for select
  using (archived = false or auth.role() = 'authenticated');

create policy "Authenticated admin insert cards"
  on public.cards for insert
  to authenticated
  with check (true);

create policy "Authenticated admin update cards"
  on public.cards for update
  to authenticated
  using (true)
  with check (true);

-- Ratings: anyone playing can submit & read aggregate votes
create policy "Public insert ratings"
  on public.card_ratings for insert
  with check (vote in (-1, 1));

create policy "Public read ratings"
  on public.card_ratings for select
  using (true);

-- Group Rooms: anyone can open/read a room; hosts create short-lived 4-char codes
create policy "Public read rooms"
  on public.group_rooms for select
  using (true);

create policy "Public create rooms"
  on public.group_rooms for insert
  with check (char_length(code) >= 4);

-- Group Submissions: guests can submit questions & view room feed; admin manages inbox
create policy "Public read room submissions"
  on public.group_submissions for select
  using (true);

create policy "Public submit room question"
  on public.group_submissions for insert
  with check (char_length(trim(text)) > 0);

create policy "Authenticated admin update submissions"
  on public.group_submissions for update
  to authenticated
  using (true)
  with check (true);

-- Enable Realtime on group_submissions so guest questions stream live into active piles
alter publication supabase_realtime add table public.group_submissions;
