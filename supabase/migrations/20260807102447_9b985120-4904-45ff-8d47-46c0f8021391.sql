WITH completed_rock_stories AS (
  SELECT DISTINCT s.id
  FROM public.stories s
  JOIN public.topic_articles ta ON ta.id = s.topic_article_id
  JOIN public.topics t ON t.id = ta.topic_id
  JOIN public.content_generation_queue q ON q.topic_article_id = ta.id
  WHERE t.slug = 'rock-music'
    AND q.status = 'completed'
    AND s.status = 'draft'
    AND s.is_published = false
    AND EXISTS (
      SELECT 1
      FROM public.slides sl
      WHERE sl.story_id = s.id
    )
)
UPDATE public.stories s
SET status = 'published',
    is_published = true,
    published_at = COALESCE(s.published_at, now()),
    scheduled_publish_at = NULL,
    updated_at = now()
FROM completed_rock_stories ready
WHERE s.id = ready.id;