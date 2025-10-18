-- Step 1: Update delete_story_cascade to support both legacy and multi-tenant stories
CREATE OR REPLACE FUNCTION public.delete_story_cascade(p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  story_record RECORD;
  deleted_counts jsonb;
  slide_count INTEGER := 0;
  visual_count INTEGER := 0;
  post_count INTEGER := 0;
  export_count INTEGER := 0;
BEGIN
  -- Get story details from both legacy and multi-tenant paths
  SELECT 
    s.*,
    a.id as legacy_article_id,
    ta.id as multi_tenant_article_id
  INTO story_record
  FROM stories s
  LEFT JOIN articles a ON a.id = s.article_id
  LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id
  WHERE s.id = p_story_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Story not found'
    );
  END IF;
  
  -- Delete associated records and count them
  
  -- Delete visuals (connected through slides)
  WITH deleted_visuals AS (
    DELETE FROM visuals 
    WHERE slide_id IN (
      SELECT id FROM slides WHERE story_id = p_story_id
    )
    RETURNING id
  )
  SELECT count(*) INTO visual_count FROM deleted_visuals;
  
  -- Delete slides
  WITH deleted_slides AS (
    DELETE FROM slides 
    WHERE story_id = p_story_id
    RETURNING id
  )
  SELECT count(*) INTO slide_count FROM deleted_slides;
  
  -- Delete posts
  WITH deleted_posts AS (
    DELETE FROM posts 
    WHERE story_id = p_story_id
    RETURNING id
  )
  SELECT count(*) INTO post_count FROM deleted_posts;
  
  -- Delete carousel exports
  WITH deleted_exports AS (
    DELETE FROM carousel_exports 
    WHERE story_id = p_story_id
    RETURNING id
  )
  SELECT count(*) INTO export_count FROM deleted_exports;
  
  -- Reset article status based on which architecture was used
  IF story_record.legacy_article_id IS NOT NULL THEN
    UPDATE articles 
    SET processing_status = 'new',
        updated_at = now()
    WHERE id = story_record.legacy_article_id 
      AND processing_status = 'processed';
  END IF;
  
  IF story_record.multi_tenant_article_id IS NOT NULL THEN
    UPDATE topic_articles 
    SET processing_status = 'new',
        updated_at = now()
    WHERE id = story_record.multi_tenant_article_id 
      AND processing_status = 'processed';
  END IF;
  
  -- Unlink parliamentary mentions if any
  UPDATE parliamentary_mentions 
  SET story_id = NULL 
  WHERE story_id = p_story_id;
  
  -- Delete the story itself
  DELETE FROM stories WHERE id = p_story_id;
  
  -- Return success with counts
  RETURN jsonb_build_object(
    'success', true,
    'story_id', p_story_id,
    'article_reset', true,
    'deleted_counts', jsonb_build_object(
      'slides', slide_count,
      'visuals', visual_count,
      'posts', post_count,
      'exports', export_count
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Step 2: Create function to clean up Diane Abbott stories for Eastbourne
CREATE OR REPLACE FUNCTION public.cleanup_diane_abbott_stories_eastbourne()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story_id uuid;
  deleted_count int := 0;
  unlinked_count int := 0;
  v_eastbourne_id uuid := 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';
BEGIN
  -- Find and delete all Diane Abbott stories for Eastbourne (both paths)
  FOR v_story_id IN (
    -- Legacy path: via articles
    SELECT DISTINCT s.id
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE a.topic_id = v_eastbourne_id
      AND (
        sl.content ILIKE '%diane abbott%' 
        OR sl.content ILIKE '%diane abbot%'
        OR EXISTS (
          SELECT 1 FROM parliamentary_mentions pm 
          WHERE pm.story_id = s.id 
            AND pm.topic_id = v_eastbourne_id
            AND (pm.mp_name ILIKE '%diane abbott%' OR pm.mp_name ILIKE '%diane abbot%')
        )
      )
    
    UNION
    
    -- Multi-tenant path: via topic_articles
    SELECT DISTINCT s.id
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE ta.topic_id = v_eastbourne_id
      AND (
        sl.content ILIKE '%diane abbott%' 
        OR sl.content ILIKE '%diane abbot%'
        OR EXISTS (
          SELECT 1 FROM parliamentary_mentions pm 
          WHERE pm.story_id = s.id 
            AND pm.topic_id = v_eastbourne_id
            AND (pm.mp_name ILIKE '%diane abbott%' OR pm.mp_name ILIKE '%diane abbot%')
        )
      )
  ) LOOP
    PERFORM public.delete_story_cascade(v_story_id);
    deleted_count := deleted_count + 1;
  END LOOP;
  
  -- Unlink all Diane Abbott mentions for Eastbourne
  WITH unlinked AS (
    UPDATE parliamentary_mentions
    SET story_id = NULL
    WHERE topic_id = v_eastbourne_id
      AND (mp_name ILIKE '%diane abbott%' OR mp_name ILIKE '%diane abbot%')
    RETURNING 1
  )
  SELECT COUNT(*) INTO unlinked_count FROM unlinked;
  
  -- Log the cleanup
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Cleaned up Diane Abbott stories for Eastbourne',
    jsonb_build_object(
      'topic_id', v_eastbourne_id,
      'deleted_stories', deleted_count,
      'unlinked_mentions', unlinked_count
    ),
    'cleanup_diane_abbott_stories_eastbourne'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_stories', deleted_count,
    'unlinked_mentions', unlinked_count
  );
END;
$$;

-- Step 3: Execute the cleanup
SELECT public.cleanup_diane_abbott_stories_eastbourne();