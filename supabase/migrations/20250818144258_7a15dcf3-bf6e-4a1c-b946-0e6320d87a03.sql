-- =========================================================
-- Local News → Social Slides: Full Bootstrap Schema (Fresh DB)
-- =========================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- 1) BASE TABLES
-- =========================================================

-- Articles (raw source items)
CREATE TABLE IF NOT EXISTS public.articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  body          TEXT,
  author        TEXT,
  published_at  TIMESTAMPTZ,
  image_url     TEXT,
  source_url    TEXT NOT NULL UNIQUE,           -- dedupe by canonical URL
  region        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  search        tsvector                         -- FTS, maintained by trigger
);

-- Stories (processed article → social-ready unit)
CREATE TABLE IF NOT EXISTS public.stories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processing','ready','published')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stories_article_unique UNIQUE (article_id)  -- one story per article
);

-- Slides (individual slides/snippets)
CREATE TABLE IF NOT EXISTS public.slides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  slide_number  INTEGER NOT NULL CHECK (slide_number >= 1),
  content       TEXT NOT NULL,
  word_count    INTEGER NOT NULL DEFAULT 0,
  alt_text      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT slides_story_slide_unique UNIQUE (story_id, slide_number)
);

-- Visuals (image assets per slide)
CREATE TABLE IF NOT EXISTS public.visuals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id      UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  image_url     TEXT,
  alt_text      TEXT,
  style_preset  TEXT DEFAULT 'editorial',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Posts (distribution metadata/package)
CREATE TABLE IF NOT EXISTS public.posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('instagram','tiktok','linkedin','x')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','failed')),
  caption       TEXT,
  published_at  TIMESTAMPTZ,
  scheduled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT posts_published_requires_time CHECK (status <> 'published' OR published_at IS NOT NULL)
);

-- =========================================================
-- 2) TRIGGER FUNCTIONS
-- =========================================================

-- Generic updated_at maintainer
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Maintain slides.word_count from slides.content
CREATE OR REPLACE FUNCTION public.update_slide_word_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.word_count := CASE
    WHEN NEW.content IS NULL THEN 0
    ELSE COALESCE(array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1), 0)
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Maintain articles.search (FTS)
CREATE OR REPLACE FUNCTION public.articles_search_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')),  'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body ,'')),  'B') ||
    setweight(to_tsvector('english', coalesce(NEW.author,'')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- 3) TRIGGERS
-- =========================================================

-- updated_at triggers
DROP TRIGGER IF EXISTS update_articles_updated_at ON public.articles;
CREATE TRIGGER update_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_stories_updated_at ON public.stories;
CREATE TRIGGER update_stories_updated_at
  BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_slides_updated_at ON public.slides;
CREATE TRIGGER update_slides_updated_at
  BEFORE UPDATE ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_visuals_updated_at ON public.visuals;
CREATE TRIGGER update_visuals_updated_at
  BEFORE UPDATE ON public.visuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- slides.word_count triggers
DROP TRIGGER IF EXISTS slides_wordcount_ins ON public.slides;
CREATE TRIGGER slides_wordcount_ins
  BEFORE INSERT ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_slide_word_count();

DROP TRIGGER IF EXISTS slides_wordcount_upd ON public.slides;
CREATE TRIGGER slides_wordcount_upd
  BEFORE UPDATE OF content ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.update_slide_word_count();

-- articles.search triggers
DROP TRIGGER IF EXISTS articles_search_tsv_ins ON public.articles;
CREATE TRIGGER articles_search_tsv_ins
  BEFORE INSERT ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_search_tsv();

DROP TRIGGER IF EXISTS articles_search_tsv_upd ON public.articles;
CREATE TRIGGER articles_search_tsv_upd
  BEFORE UPDATE OF title, body, author ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_search_tsv();

-- =========================================================
-- 4) INDEXES
-- =========================================================

-- Articles
CREATE INDEX IF NOT EXISTS idx_articles_region        ON public.articles(region);
CREATE INDEX IF NOT EXISTS idx_articles_published_at  ON public.articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_search        ON public.articles USING GIN (search);

-- Stories
CREATE INDEX IF NOT EXISTS idx_stories_article_id     ON public.stories(article_id);
CREATE INDEX IF NOT EXISTS idx_stories_status         ON public.stories(status);

-- Slides
CREATE INDEX IF NOT EXISTS idx_slides_story_order     ON public.slides(story_id, slide_number);

-- Visuals
CREATE INDEX IF NOT EXISTS idx_visuals_slide_id       ON public.visuals(slide_id);

-- Posts
CREATE INDEX IF NOT EXISTS idx_posts_status_platform  ON public.posts(status, platform);
-- prevent duplicate published per story+platform
DROP INDEX IF EXISTS posts_unique_published_story_platform;
CREATE UNIQUE INDEX posts_unique_published_story_platform
  ON public.posts(story_id, platform)
  WHERE status = 'published';

-- =========================================================
-- 5) ROW LEVEL SECURITY (RLS)
-- =========================================================

-- Enable RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visuals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts    ENABLE ROW LEVEL SECURITY;

-- Optional: public/anon SELECT (comment out these 5 if you don't want anonymous reads)
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