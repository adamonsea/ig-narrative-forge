-- Replace cleanup function to safely clear parliamentary stories for a topic
CREATE OR REPLACE FUNCTION public.cleanup_parliamentary_stories_for_topic(p_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story_id uuid;
  deleted_stories int := 0;
  reset_mentions int := 0;
  deleted_queue int := 0;
  deleted_topic_articles int := 0;
  deleted_shared int := 0;
BEGIN
  -- 1) Loop stories linked via parliamentary_mentions and cascade delete each
  FOR v_story_id IN (
    SELECT DISTINCT s.id
    FROM stories s
    JOIN parliamentary_mentions pm ON pm.story_id = s.id
    WHERE pm.topic_id = p_topic_id
  ) LOOP
    PERFORM public.delete_story_cascade(v_story_id);
    deleted_stories := deleted_stories + 1;
  END LOOP;

  -- 2) Reset story_id on mentions for topic
  WITH upd AS (
    UPDATE parliamentary_mentions
    SET story_id = NULL
    WHERE topic_id = p_topic_id AND story_id IS NOT NULL
    RETURNING 1
  ) SELECT COUNT(*) INTO reset_mentions FROM upd;

  -- 3) Remove queue items tied to this topic's topic_articles to avoid FK errors
  WITH delq AS (
    DELETE FROM content_generation_queue
    WHERE topic_article_id IN (
      SELECT ta.id FROM topic_articles ta WHERE ta.topic_id = p_topic_id
    )
    OR article_id IN (
      SELECT a.id FROM articles a WHERE a.topic_id = p_topic_id
    )
    RETURNING 1
  ) SELECT COUNT(*) INTO deleted_queue FROM delq;

  -- 4) Delete orphaned topic_articles for this topic
  WITH delta AS (
    DELETE FROM topic_articles ta
    WHERE ta.topic_id = p_topic_id
      AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.topic_article_id = ta.id)
    RETURNING 1
  ) SELECT COUNT(*) INTO deleted_topic_articles FROM delta;

  -- 5) Delete orphaned shared_article_content rows that relate to parliament sources
  WITH delsac AS (
    DELETE FROM shared_article_content sac
    WHERE (sac.url ILIKE '%commonsvotes%' OR sac.url ILIKE '%parliament%')
      AND NOT EXISTS (SELECT 1 FROM topic_articles ta WHERE ta.shared_content_id = sac.id)
      AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.shared_content_id = sac.id)
    RETURNING 1
  ) SELECT COUNT(*) INTO deleted_shared FROM delsac;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_stories', deleted_stories,
    'reset_mentions', reset_mentions,
    'deleted_queue', deleted_queue,
    'deleted_topic_articles', deleted_topic_articles,
    'deleted_shared_content', deleted_shared
  );
END;
$$;

-- Run cleanup for Eastbourne topic now
SELECT public.cleanup_parliamentary_stories_for_topic('d224e606-1a4c-4713-8135-1d30e2d6d0c6'::uuid);
