-- Create story_social_content table for storing per-story social/post copy
create table if not exists public.story_social_content (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  platform text not null,
  content_type text not null default 'carousel_post',
  caption text,
  hashtags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, platform, content_type)
);

create index if not exists story_social_content_story_id_idx
  on public.story_social_content(story_id);

create index if not exists story_social_content_platform_idx
  on public.story_social_content(platform);

-- RLS
alter table public.story_social_content enable row level security;

-- Service role full access
create policy "story_social_content service role access"
on public.story_social_content
for all
using (auth.role() = 'service_role'::text)
with check (auth.role() = 'service_role'::text);

-- Topic owner access (multi-tenant + legacy)
create policy "Users can manage social content for their stories"
on public.story_social_content
for all
using (
  exists (
    select 1
    from (
      (
        public.stories s
        left join public.articles a on a.id = s.article_id
        left join public.topics t1 on t1.id = a.topic_id
        left join public.topic_articles ta on ta.id = s.topic_article_id
        left join public.topics t2 on t2.id = ta.topic_id
      )
    )
    where s.id = story_social_content.story_id
      and (t1.created_by = auth.uid() or t2.created_by = auth.uid())
  )
)
with check (
  exists (
    select 1
    from (
      (
        public.stories s
        left join public.articles a on a.id = s.article_id
        left join public.topics t1 on t1.id = a.topic_id
        left join public.topic_articles ta on ta.id = s.topic_article_id
        left join public.topics t2 on t2.id = ta.topic_id
      )
    )
    where s.id = story_social_content.story_id
      and (t1.created_by = auth.uid() or t2.created_by = auth.uid())
  )
);

-- updated_at trigger (reuse if exists)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'update_story_social_content_updated_at'
  ) then
    create trigger update_story_social_content_updated_at
    before update on public.story_social_content
    for each row
    execute function public.update_updated_at_column();
  end if;
end $$;