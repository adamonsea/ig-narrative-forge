-- Create bulk cleanup function for topics
CREATE OR REPLACE FUNCTION public.bulk_cleanup_topic_content(p_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  topic_record RECORD;
  deleted_counts jsonb;
  legacy_articles_count INTEGER := 0;
  multi_tenant_articles_count INTEGER := 0;
  stories_count INTEGER := 0;
  slides_count INTEGER := 0;
  queue_count INTEGER := 0;
  posts_count INTEGER := 0;
  exports_count INTEGER := 0;
BEGIN
  -- Get topic details first
  SELECT * INTO topic_record FROM topics WHERE id = p_topic_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Topic not found'
    );
  END IF;
  
  -- Delete in dependency order to avoid foreign key conflicts
  
  -- Delete slides (via stories)
  WITH deleted_slides AS (
    DELETE FROM slides 
    WHERE story_id IN (
      SELECT s.id FROM stories s
      JOIN articles a ON a.id = s.article_id
      WHERE a.topic_id = p_topic_id
    )
    RETURNING id
  )
  SELECT count(*) INTO slides_count FROM deleted_slides;
  
  -- Delete posts
  WITH deleted_posts AS (
    DELETE FROM posts 
    WHERE story_id IN (
      SELECT s.id FROM stories s
      JOIN articles a ON a.id = s.article_id
      WHERE a.topic_id = p_topic_id
    )
    RETURNING id
  )
  SELECT count(*) INTO posts_count FROM deleted_posts;
  
  -- Delete carousel exports
  WITH deleted_exports AS (
    DELETE FROM carousel_exports 
    WHERE story_id IN (
      SELECT s.id FROM stories s
      JOIN articles a ON a.id = s.article_id
      WHERE a.topic_id = p_topic_id
    )
    RETURNING id
  )
  SELECT count(*) INTO exports_count FROM deleted_exports;
  
  -- Delete stories
  WITH deleted_stories AS (
    DELETE FROM stories 
    WHERE article_id IN (
      SELECT id FROM articles WHERE topic_id = p_topic_id
    )
    RETURNING id
  )
  SELECT count(*) INTO stories_count FROM deleted_stories;
  
  -- Delete content generation queue items
  WITH deleted_queue AS (
    DELETE FROM content_generation_queue 
    WHERE article_id IN (
      SELECT id FROM articles WHERE topic_id = p_topic_id
    )
    RETURNING id
  )
  SELECT count(*) INTO queue_count FROM deleted_queue;
  
  -- Delete legacy articles
  WITH deleted_legacy_articles AS (
    DELETE FROM articles 
    WHERE topic_id = p_topic_id
    RETURNING id
  )
  SELECT count(*) INTO legacy_articles_count FROM deleted_legacy_articles;
  
  -- Delete multi-tenant articles
  WITH deleted_multi_tenant AS (
    DELETE FROM topic_articles 
    WHERE topic_id = p_topic_id
    RETURNING id
  )
  SELECT count(*) INTO multi_tenant_articles_count FROM deleted_multi_tenant;
  
  -- Log the cleanup
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Bulk cleaned topic content',
    jsonb_build_object(
      'topic_id', p_topic_id,
      'topic_name', topic_record.name,
      'deleted_counts', jsonb_build_object(
        'legacy_articles', legacy_articles_count,
        'multi_tenant_articles', multi_tenant_articles_count,
        'stories', stories_count,
        'slides', slides_count,
        'queue_items', queue_count,
        'posts', posts_count,
        'exports', exports_count
      )
    ),
    'bulk_cleanup_topic_content'
  );
  
  -- Return success with counts
  RETURN jsonb_build_object(
    'success', true,
    'topic_id', p_topic_id,
    'topic_name', topic_record.name,
    'deleted_counts', jsonb_build_object(
      'legacy_articles', legacy_articles_count,
      'multi_tenant_articles', multi_tenant_articles_count,
      'stories', stories_count,
      'slides', slides_count,
      'queue_items', queue_count,
      'posts', posts_count,
      'exports', exports_count
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$