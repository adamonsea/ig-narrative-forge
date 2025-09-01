-- Fix delete_story_cascade function by removing logging that can cause read-only transaction errors
CREATE OR REPLACE FUNCTION public.delete_story_cascade(p_story_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  story_record RECORD;
  deleted_counts jsonb;
  slide_count INTEGER := 0;
  visual_count INTEGER := 0;
  post_count INTEGER := 0;
  export_count INTEGER := 0;
BEGIN
  -- Get story details first
  SELECT s.*, a.id as article_id 
  INTO story_record
  FROM stories s
  JOIN articles a ON a.id = s.article_id
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
  
  -- Reset article status to 'new' if it was 'processed'
  UPDATE articles 
  SET processing_status = 'new',
      updated_at = now()
  WHERE id = story_record.article_id 
    AND processing_status = 'processed';
  
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
$function$;