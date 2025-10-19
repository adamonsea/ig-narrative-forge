DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'topic_articles' 
      AND policyname = 'Public can view topic_articles for public topics'
  ) THEN
    CREATE POLICY "Public can view topic_articles for public topics"
    ON public.topic_articles
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.topics t
        WHERE t.id = topic_id
          AND t.is_public = true
          AND t.is_active = true
      )
    );
  END IF;
END $$;