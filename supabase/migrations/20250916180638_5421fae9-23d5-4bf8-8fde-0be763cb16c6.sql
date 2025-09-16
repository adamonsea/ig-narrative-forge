-- Add public access policy for stories from public topics
-- This allows anonymous users to view stories when the topic is marked as public

CREATE POLICY "Stories from public topics are publicly viewable"
ON public.stories
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.topics t
    JOIN public.articles a ON a.topic_id = t.id
    WHERE a.id = stories.article_id
    AND t.is_public = true
    AND t.is_active = true
  )
  OR
  EXISTS (
    SELECT 1 FROM public.topics t
    JOIN public.topic_articles ta ON ta.topic_id = t.id
    WHERE ta.id = stories.topic_article_id
    AND t.is_public = true
    AND t.is_active = true
  )
);

-- Also add public access for slides when the parent story is from a public topic
CREATE POLICY "Slides from public topic stories are publicly viewable"
ON public.slides
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.stories s
    JOIN public.topics t ON (
      (EXISTS (SELECT 1 FROM public.articles a WHERE a.id = s.article_id AND a.topic_id = t.id))
      OR
      (EXISTS (SELECT 1 FROM public.topic_articles ta WHERE ta.id = s.topic_article_id AND ta.topic_id = t.id))
    )
    WHERE s.id = slides.story_id
    AND t.is_public = true
    AND t.is_active = true
    AND s.status = 'ready'
    AND s.is_published = true
  )
);