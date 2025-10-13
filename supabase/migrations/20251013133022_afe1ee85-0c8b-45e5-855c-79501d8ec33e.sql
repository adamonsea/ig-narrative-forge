-- Allow topic owners and admins to UPDATE slides
-- Ensure RLS is enabled (it already is in most setups)
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

-- Policy: Slides update by story owners, admins, or service role
DROP POLICY IF EXISTS "Slides update by story owners and admins" ON public.slides;
CREATE POLICY "Slides update by story owners and admins"
ON public.slides
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE s.id = slides.story_id
      AND t.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.stories s
    JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    JOIN public.topics t ON t.id = ta.topic_id
    WHERE s.id = slides.story_id
      AND t.created_by = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE s.id = slides.story_id
      AND t.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.stories s
    JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    JOIN public.topics t ON t.id = ta.topic_id
    WHERE s.id = slides.story_id
      AND t.created_by = auth.uid()
  )
);

-- Optional: touch stories.updated_at when a slide updates (improves freshness ordering)
CREATE OR REPLACE FUNCTION public.touch_story_updated_at() RETURNS trigger AS $$
BEGIN
  UPDATE public.stories SET updated_at = now() WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_touch_story_updated_at ON public.slides;
CREATE TRIGGER trg_touch_story_updated_at
AFTER UPDATE ON public.slides
FOR EACH ROW
EXECUTE FUNCTION public.touch_story_updated_at();