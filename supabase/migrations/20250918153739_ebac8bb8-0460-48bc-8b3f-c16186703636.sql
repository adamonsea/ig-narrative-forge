-- Phase 4.4: Policy Recursion Hotfix
-- 1) Helper functions to avoid cross-table policy recursion

CREATE OR REPLACE FUNCTION public.is_story_published(p_story_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = p_story_id
      AND s.is_published = true
      AND s.status IN ('ready','published')
  );
$$;

CREATE OR REPLACE FUNCTION public.article_is_public(p_article_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.article_id = p_article_id
      AND s.is_published = true
      AND s.status IN ('ready','published')
  );
$$;

-- 2) Public-read policies rewritten to use only local columns or helper fns

-- Stories: public can read published stories without touching other tables
DROP POLICY IF EXISTS "Public read: published stories only" ON public.stories;
CREATE POLICY "Public read: public stories"
ON public.stories
FOR SELECT TO anon, authenticated
USING (is_published = true AND status IN ('ready','published'));

-- Slides: public can read slides of public stories via helper (no joins in policy)
DROP POLICY IF EXISTS "Public read: slides for published stories" ON public.slides;
CREATE POLICY "Public read: slides of public stories"
ON public.slides
FOR SELECT TO anon, authenticated
USING (public.is_story_published(story_id));

-- Visuals: public can read visuals if their slide's story is public
DROP POLICY IF EXISTS "Public read: visuals for published stories" ON public.visuals;
CREATE POLICY "Public read: visuals of public stories"
ON public.visuals
FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.slides sl
  WHERE sl.id = visuals.slide_id
    AND public.is_story_published(sl.story_id)
));

-- Posts: public can read posts if story is public
DROP POLICY IF EXISTS "Public read: posts for published stories" ON public.posts;
CREATE POLICY "Public read: posts of public stories"
ON public.posts
FOR SELECT TO anon, authenticated
USING (public.is_story_published(story_id));

-- Articles: avoid EXISTS against stories directly; use helper function
DROP POLICY IF EXISTS "Public read: articles referenced by published stories" ON public.articles;
CREATE POLICY "Public read: articles of public stories"
ON public.articles
FOR SELECT TO anon, authenticated
USING (public.article_is_public(id));