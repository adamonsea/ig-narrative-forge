-- Ensure pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tighten integrity
ALTER TABLE public.stories
  ADD CONSTRAINT IF NOT EXISTS stories_article_unique UNIQUE (article_id);

ALTER TABLE public.slides
  ADD CONSTRAINT IF NOT EXISTS slides_story_slide_unique UNIQUE (story_id, slide_number),
  ADD CONSTRAINT IF NOT EXISTS slides_slide_number_check CHECK (slide_number >= 1);

ALTER TABLE public.slides  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.visuals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Reuse your timestamp trigger function (must exist)
CREATE TRIGGER IF NOT EXISTS update_slides_updated_at
  BEFORE UPDATE ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_visuals_updated_at
  BEFORE UPDATE ON public.visuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Compute word_count server-side
CREATE OR REPLACE FUNCTION public.update_slide_word_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.word_count := CASE
    WHEN NEW.content IS NULL THEN 0
    ELSE array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1)
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS slides_wordcount_ins
  BEFORE INSERT ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_slide_word_count();

CREATE TRIGGER IF NOT EXISTS slides_wordcount_upd
  BEFORE UPDATE OF content ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_slide_word_count();

-- 2) Posts: scheduling + de-dup + sanity checks
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS posts_unique_published_story_platform
  ON public.posts(story_id, platform)
  WHERE status = 'published';

ALTER TABLE public.posts
  ADD CONSTRAINT IF NOT EXISTS posts_published_requires_time
  CHECK (status <> 'published' OR published_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_posts_status_platform ON public.posts(status, platform);
CREATE INDEX IF NOT EXISTS idx_stories_status ON public.stories(status);

-- 3) Articles search
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS search tsvector;

CREATE OR REPLACE FUNCTION public.articles_search_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.author,'')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS articles_search_tsv_ins
  BEFORE INSERT ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_search_tsv();

CREATE TRIGGER IF NOT EXISTS articles_search_tsv_upd
  BEFORE UPDATE OF title, body, author ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_search_tsv();

CREATE INDEX IF NOT EXISTS idx_articles_search ON public.articles USING GIN (search);

-- 4) RLS: lock writes down (Supabase-friendly)
DROP POLICY IF EXISTS "Articles can be inserted by everyone" ON public.articles;
DROP POLICY IF EXISTS "Stories can be inserted by everyone"  ON public.stories;
DROP POLICY IF EXISTS "Stories can be updated by everyone"   ON public.stories;
DROP POLICY IF EXISTS "Slides can be inserted by everyone"   ON public.slides;
DROP POLICY IF EXISTS "Visuals can be inserted by everyone"  ON public.visuals;
DROP POLICY IF EXISTS "Posts can be inserted by everyone"    ON public.posts;
DROP POLICY IF EXISTS "Posts can be updated by everyone"     ON public.posts;

-- Public reads (only if you truly want anonymous read access)
CREATE POLICY IF NOT EXISTS "Articles are viewable by everyone"
  ON public.articles FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Stories are viewable by everyone"
  ON public.stories  FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Slides are viewable by everyone"
  ON public.slides   FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Visuals are viewable by everyone"
  ON public.visuals  FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Posts are viewable by everyone"
  ON public.posts    FOR SELECT USING (true);

-- Restrict writes to authenticated users (predicate can be true; role is enforced by TO)
CREATE POLICY IF NOT EXISTS "Articles insert by authenticated"
  ON public.articles FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Stories write by authenticated"
  ON public.stories FOR INSERT, UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Slides insert by authenticated"
  ON public.slides FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Visuals insert by authenticated"
  ON public.visuals FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Posts write by authenticated"
  ON public.posts FOR INSERT, UPDATE TO authenticated
  USING (true) WITH CHECK (true);