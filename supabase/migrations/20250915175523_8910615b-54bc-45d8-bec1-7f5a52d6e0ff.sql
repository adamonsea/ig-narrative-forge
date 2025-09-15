-- Update the get_stories_unified RPC function to return all necessary fields for the Published stories tab
CREATE OR REPLACE FUNCTION public.get_stories_unified(p_topic_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(
   id uuid, 
   article_id uuid, 
   topic_article_id uuid, 
   shared_content_id uuid, 
   title text, 
   status text, 
   is_published boolean, 
   created_at timestamp with time zone, 
   updated_at timestamp with time zone, 
   slides_count integer, 
   source_type text,
   -- Additional fields needed for UI functionality
   slides jsonb,
   source_url text, 
   author text, 
   word_count integer,
   cover_illustration_url text,
   cover_illustration_prompt text,
   illustration_generated_at timestamp with time zone,
   slidetype text,
   tone text,
   writing_style text,
   audience_expertise text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.article_id,
    s.topic_article_id,
    s.shared_content_id,
    s.title,
    s.status,
    s.is_published,
    s.created_at,
    s.updated_at,
    (SELECT COUNT(*)::INTEGER FROM slides WHERE story_id = s.id) as slides_count,
    CASE 
      WHEN s.article_id IS NOT NULL THEN 'legacy'
      ELSE 'multi_tenant'
    END::TEXT as source_type,
    -- Aggregate slides as JSONB array
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', sl.id,
          'slide_number', sl.slide_number,
          'content', sl.content,
          'word_count', sl.word_count,
          'type', sl.type,
          'image_url', sl.image_url,
          'alt_text', sl.alt_text
        ) ORDER BY sl.slide_number
      ) 
      FROM slides sl 
      WHERE sl.story_id = s.id), 
      '[]'::jsonb
    ) as slides,
    -- Get source URL from either legacy articles or shared content
    COALESCE(a.source_url, sac.url) as source_url,
    -- Get author from either legacy articles or shared content  
    COALESCE(a.author, sac.author) as author,
    -- Get word count from either legacy articles or shared content
    COALESCE(a.word_count, sac.word_count) as word_count,
    -- Story-specific fields
    s.cover_illustration_url,
    s.cover_illustration_prompt,
    s.illustration_generated_at,
    -- Get generation parameters from queue if available
    cgq.slidetype,
    cgq.tone::text,
    cgq.writing_style,
    cgq.audience_expertise::text
  FROM stories s
  LEFT JOIN articles a ON a.id = s.article_id
  LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id
  LEFT JOIN shared_article_content sac ON sac.id = s.shared_content_id
  LEFT JOIN content_generation_queue cgq ON (
    cgq.article_id = s.article_id OR 
    cgq.topic_article_id = s.topic_article_id
  )
  WHERE (p_topic_id IS NULL OR a.topic_id = p_topic_id OR ta.topic_id = p_topic_id)
  ORDER BY s.created_at DESC;
END;
$function$