-- Create storage bucket for topic logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('topic-logos', 'topic-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for topic logos
CREATE POLICY "Topic logo public access" ON storage.objects
FOR SELECT USING (bucket_id = 'topic-logos');

CREATE POLICY "Topic owners can upload logos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'topic-logos' 
  AND auth.uid() IN (
    SELECT created_by FROM topics 
    WHERE id = (storage.foldername(name))[1]::uuid
  )
);

CREATE POLICY "Topic owners can update logos" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'topic-logos' 
  AND auth.uid() IN (
    SELECT created_by FROM topics 
    WHERE id = (storage.foldername(name))[1]::uuid
  )
);

CREATE POLICY "Topic owners can delete logos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'topic-logos' 
  AND auth.uid() IN (
    SELECT created_by FROM topics 
    WHERE id = (storage.foldername(name))[1]::uuid
  )
);

-- Create function to get topic stories with keyword filtering
CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cover_illustration_url text,
  cover_illustration_prompt text,
  article_source_url text,
  article_published_at timestamp with time zone,
  article_author text,
  article_title text
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  topic_record RECORD;
BEGIN
  -- Get topic info first
  SELECT t.* INTO topic_record
  FROM topics t
  WHERE t.slug = p_topic_slug 
    AND t.is_public = true 
    AND t.is_active = true;
    
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Return stories with optional keyword filtering
  RETURN QUERY
  SELECT 
    s.id,
    COALESCE(sac.title, a.title) as title,
    COALESCE(sac.author, a.author) as author,
    s.created_at,
    s.updated_at,
    s.cover_illustration_url,
    s.cover_illustration_prompt,
    COALESCE(sac.url, a.source_url) as article_source_url,
    COALESCE(sac.published_at, a.published_at) as article_published_at,
    COALESCE(sac.author, a.author) as article_author,
    COALESCE(sac.title, a.title) as article_title
  FROM stories s
  LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
  LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  LEFT JOIN articles a ON s.article_id = a.id
  WHERE s.is_published = true
    AND s.status IN ('ready', 'published')
    AND (
      (ta.topic_id = topic_record.id) OR 
      (a.topic_id = topic_record.id AND ta.id IS NULL)
    )
    AND s.created_at >= CURRENT_DATE - INTERVAL '30 days'  -- Last 30 days
    AND (
      p_keywords IS NULL OR 
      array_length(p_keywords, 1) IS NULL OR
      EXISTS (
        SELECT 1 FROM slides sl
        WHERE sl.story_id = s.id
        AND (
          -- Check slide content for keywords
          EXISTS (
            SELECT 1 FROM unnest(p_keywords) AS keyword
            WHERE sl.content ILIKE '%' || keyword || '%'
          ) OR
          -- Check article title/body for keywords
          EXISTS (
            SELECT 1 FROM unnest(p_keywords) AS keyword
            WHERE (
              COALESCE(sac.title, a.title) ILIKE '%' || keyword || '%' OR
              COALESCE(sac.body, a.body) ILIKE '%' || keyword || '%'
            )
          )
        )
      )
    )
  ORDER BY s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;