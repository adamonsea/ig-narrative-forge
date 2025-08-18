-- Ensure pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============== 1) Tighten integrity (conditional) ===============
DO $$
BEGIN
  -- Unique story per article
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_article_unique'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_article_unique UNIQUE (article_id);
  END IF;

  -- Unique slide number within story
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'slides_story_slide_unique'
  ) THEN
    ALTER TABLE public.slides
      ADD CONSTRAINT slides_story_slide_unique UNIQUE (story_id, slide_number);
  END IF;

  -- Sane slide numbering
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'slides_slide_number_check'
  ) THEN
    ALTER TABLE public.slides
      ADD CONSTRAINT slides_slide_number_check CHECK (slide_number >= 1);
  END IF;

  -- updated_at columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='slides' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.slides
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='visuals' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.visuals
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- scheduled_at on posts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='scheduled_at'
  ) THEN
    ALTER TABLE public.posts
      ADD COLUMN scheduled_at TIMESTAMPTZ;
  END IF;

  -- search column on articles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='articles' AND column_name='search'
  ) THEN
    ALTER TABLE public.articles
      ADD COLUMN search tsvector;
  END IF;

  -- published must have time
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_published_requires_time'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_published_requires_time
      CHECK (status <> 'published' OR published_at IS NOT NULL);
  END IF;
END $$;

-- =============== 2) Triggers for updated_at =======================
DROP TRIGGER IF EXISTS update_slides_updated_at ON public.slides;
CREATE TRIGGER update_slides_updated_at
  BEFORE UPDATE ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_visuals_updated_at ON public.visuals;
CREATE TRIGGER update_visuals_updated_at
  BEFORE UPDATE ON public.visuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== 3) Word count maintenance ========================
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

DROP TRIGGER IF EXISTS slides_wordcount_ins ON public.slides;
CREATE TRIGGER slides_wordcount_ins
  BEFORE INSERT ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_slide_word_count();

DROP TRIGGER IF EXISTS slides_wordcount_upd ON public.slides;
CREATE TRIGGER slides_wordcount_upd
  BEFORE UPDATE OF content ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_slide_word_count();

-- =============== 4) Indexes ======================================
-- Avoid duplicate published per story+platform
DROP INDEX IF EXISTS posts_unique_published_story_platform;
CREATE UNIQUE INDEX posts_unique_published_story_platform
  ON public.posts(story_id, platform)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_posts_status_platform ON public.posts(status, platform);
CREATE INDEX IF NOT EXISTS idx_stories_status ON public.stories(status);

-- Full-text search for articles
CREATE OR REPLACE FUNCTION public.articles_search_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.author,'')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_search_tsv_ins ON public.articles;
CREATE TRIGGER articles_search_tsv_ins
  BEFORE INSERT ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_search_tsv();

DROP TRIGGER IF EXISTS articles_search_tsv_upd ON public.articles;
CREATE TRIGGER articles_search_tsv_upd
  BEFORE UPDATE OF title, body, author ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_search_tsv();

CREATE INDEX IF NOT EXISTS idx_articles_search ON public.articles USING GIN (search);

-- =============== 5) RLS policies (secure writes) ==================
-- Drop permissive write policies if present
DROP POLICY IF EXISTS "Articles can be inserted by everyone" ON public.articles;
DROP POLICY IF EXISTS "Stories can be inserted by everyone"  ON public.stories;
DROP POLICY IF EXISTS "Stories can be updated by everyone"   ON public.stories;
DROP POLICY IF EXISTS "Slides can be inserted by everyone"   ON public.slides;
DROP POLICY IF EXISTS "Visuals can be inserted by everyone"  ON public.visuals;
DROP POLICY IF EXISTS "Posts can be inserted by everyone"    ON public.posts;
DROP POLICY IF EXISTS "Posts can be updated by everyone"     ON public.posts;

-- SELECT policies (enable anon/public read only if desired)
DROP POLICY IF EXISTS "Articles are viewable by everyone" ON public.articles;
CREATE POLICY "Articles are viewable by everyone"
  ON public.articles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Stories are viewable by everyone" ON public.stories;
CREATE POLICY "Stories are viewable by everyone"
  ON public.stories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Slides are viewable by everyone" ON public.slides;
CREATE POLICY "Slides are viewable by everyone"
  ON public.slides FOR SELECT USING (true);

DROP POLICY IF EXISTS "Visuals are viewable by everyone" ON public.visuals;
CREATE POLICY "Visuals are viewable by everyone"
  ON public.visuals FOR SELECT USING (true);

DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
CREATE POLICY "Posts are viewable by everyone"
  ON public.posts FOR SELECT USING (true);

-- Authenticated writes (separate INSERT and UPDATE policies)
DROP POLICY IF EXISTS "Articles insert by authenticated" ON public.articles;
CREATE POLICY "Articles insert by authenticated"
  ON public.articles FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Stories insert by authenticated" ON public.stories;
CREATE POLICY "Stories insert by authenticated"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Stories update by authenticated" ON public.stories;
CREATE POLICY "Stories update by authenticated"
  ON public.stories FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Slides insert by authenticated" ON public.slides;
CREATE POLICY "Slides insert by authenticated"
  ON public.slides FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Visuals insert by authenticated" ON public.visuals;
CREATE POLICY "Visuals insert by authenticated"
  ON public.visuals FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Posts insert by authenticated" ON public.posts;
CREATE POLICY "Posts insert by authenticated"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Posts update by authenticated" ON public.posts;
CREATE POLICY "Posts update by authenticated"
  ON public.posts FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);