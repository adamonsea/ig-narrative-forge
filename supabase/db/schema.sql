-- ==============================
-- CORE TABLES
-- ==============================

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text,
  source text,
  content text,
  created_at timestamptz default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete cascade,
  headline text not null,
  summary text,
  created_at timestamptz default now()
);

create table if not exists public.slides (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  slide_number int not null,
  content text not null,
  word_count int not null default 0,
  type text check (type in ('hook','content','payoff')),
  image_url text,
  alt_text text,
  created_at timestamptz default now(),
  unique(story_id, slide_number)
);

-- ==============================
-- POSTS & PACKAGES
-- ==============================

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  platform text check (platform in ('instagram','tiktok','linkedin','x')),
  region text,
  caption text,
  hashtags text[],
  package_json jsonb not null,  -- raw PostPackage payload
  created_at timestamptz default now()
);

-- ==============================
-- PUBLISHING JOBS / EVENTS
-- ==============================

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  status text check (status in ('queued','running','completed','failed')) default 'queued',
  idempotency_key text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists job_runs_idempotency_idx
  on public.job_runs(idempotency_key);

create table if not exists public.publish_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.job_runs(id) on delete cascade,
  event_type text,         -- e.g. webhook_received, pushed_to_buffer
  event_payload jsonb,
  created_at timestamptz default now()
);

-- ==============================
-- BASIC RLS
-- ==============================

alter table public.articles enable row level security;
alter table public.stories enable row level security;
alter table public.slides enable row level security;
alter table public.posts enable row level security;
alter table public.job_runs enable row level security;
alter table public.publish_events enable row level security;

-- For now: open read/write to all authenticated users
create policy "allow read/write for all" on public.articles
  for all using (true) with check (true);

create policy "allow read/write for all" on public.stories
  for all using (true) with check (true);

create policy "allow read/write for all" on public.slides
  for all using (true) with check (true);

create policy "allow read/write for all" on public.posts
  for all using (true) with check (true);

create policy "allow read/write for all" on public.job_runs
  for all using (true) with check (true);

create policy "allow read/write for all" on public.publish_events
  for all using (true) with check (true);
