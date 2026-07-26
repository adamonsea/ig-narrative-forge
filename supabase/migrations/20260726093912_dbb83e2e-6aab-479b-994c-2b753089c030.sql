-- One active queue job per topic_article_id (parallels existing legacy article index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_queue_unique_topic_article_pending
  ON public.content_generation_queue (topic_article_id)
  WHERE topic_article_id IS NOT NULL
    AND status IN ('pending', 'processing');

-- One story per topic_article_id (parallels stories_article_unique for legacy)
CREATE UNIQUE INDEX IF NOT EXISTS stories_topic_article_unique
  ON public.stories (topic_article_id)
  WHERE topic_article_id IS NOT NULL;