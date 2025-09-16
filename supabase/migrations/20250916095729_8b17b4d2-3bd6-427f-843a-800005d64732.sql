-- Enhanced topic deletion to clean up orphaned sources
CREATE OR REPLACE FUNCTION public.delete_topic_cascade(p_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  sources_count INTEGER := 0;
  orphaned_sources_count INTEGER := 0;
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
  
  -- Delete topic sources relationships
  WITH deleted_topic_sources AS (
    DELETE FROM topic_sources
    WHERE topic_id = p_topic_id
    RETURNING source_id
  )
  SELECT count(*) INTO sources_count FROM deleted_topic_sources;
  
  -- Clean up orphaned sources after removing topic links
  WITH orphaned_sources AS (
    DELETE FROM content_sources cs
    WHERE NOT EXISTS (
      SELECT 1 FROM topic_sources ts WHERE ts.source_id = cs.id
    )
    AND cs.id NOT IN (
      -- Keep sources that are still referenced in articles or other places
      SELECT DISTINCT source_id FROM articles WHERE source_id IS NOT NULL
      UNION
      SELECT DISTINCT source_id FROM topic_articles WHERE source_id IS NOT NULL
    )
    RETURNING id
  )
  SELECT count(*) INTO orphaned_sources_count FROM orphaned_sources;
  
  -- Delete topic automation settings
  DELETE FROM topic_automation_settings WHERE topic_id = p_topic_id;
  DELETE FROM topic_sentiment_settings WHERE topic_id = p_topic_id;
  DELETE FROM sentiment_cards WHERE topic_id = p_topic_id;
  DELETE FROM daily_content_availability WHERE topic_id = p_topic_id;
  DELETE FROM scraped_urls_history WHERE topic_id = p_topic_id;
  
  -- Delete the topic itself
  DELETE FROM topics WHERE id = p_topic_id;
  
  -- Log the cleanup
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Enhanced topic deletion with source cleanup',
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
        'exports', exports_count,
        'topic_sources', sources_count,
        'orphaned_sources', orphaned_sources_count
      )
    ),
    'delete_topic_cascade'
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
      'exports', exports_count,
      'topic_sources', sources_count,
      'orphaned_sources', orphaned_sources_count
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

-- Function to clean up orphaned sources
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_sources()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  orphaned_count INTEGER := 0;
  duplicate_count INTEGER := 0;
  source_record RECORD;
  canonical_source_id UUID;
BEGIN
  -- Step 1: Remove completely orphaned sources
  WITH deleted_orphaned AS (
    DELETE FROM content_sources cs
    WHERE NOT EXISTS (
      SELECT 1 FROM topic_sources ts WHERE ts.source_id = cs.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM articles a WHERE a.source_id = cs.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM topic_articles ta WHERE ta.source_id = cs.id
    )
    RETURNING id, source_name
  )
  SELECT count(*) INTO orphaned_count FROM deleted_orphaned;
  
  -- Step 2: Consolidate duplicate sources by canonical_domain
  FOR source_record IN 
    SELECT 
      canonical_domain,
      count(*) as duplicate_count,
      array_agg(id ORDER BY 
        CASE WHEN feed_url LIKE '%/rss%' OR feed_url LIKE '%/feed%' THEN 1 ELSE 2 END,
        articles_scraped DESC NULLS LAST,
        created_at ASC
      ) as source_ids
    FROM content_sources 
    WHERE canonical_domain IS NOT NULL
    GROUP BY canonical_domain 
    HAVING count(*) > 1
  LOOP
    -- Keep the first source (best RSS feed, most articles, oldest)
    canonical_source_id := source_record.source_ids[1];
    
    -- Update any topic_sources references to point to canonical source
    UPDATE topic_sources 
    SET source_id = canonical_source_id
    WHERE source_id = ANY(source_record.source_ids[2:])
    AND NOT EXISTS (
      SELECT 1 FROM topic_sources ts2 
      WHERE ts2.topic_id = topic_sources.topic_id 
      AND ts2.source_id = canonical_source_id
    );
    
    -- Delete the duplicate topic_sources that would create conflicts
    DELETE FROM topic_sources 
    WHERE source_id = ANY(source_record.source_ids[2:]);
    
    -- Update articles to reference canonical source
    UPDATE articles 
    SET source_id = canonical_source_id
    WHERE source_id = ANY(source_record.source_ids[2:]);
    
    -- Update topic_articles to reference canonical source  
    UPDATE topic_articles 
    SET source_id = canonical_source_id
    WHERE source_id = ANY(source_record.source_ids[2:]);
    
    -- Delete the duplicate sources
    DELETE FROM content_sources 
    WHERE id = ANY(source_record.source_ids[2:]);
    
    duplicate_count := duplicate_count + array_length(source_record.source_ids, 1) - 1;
    
    -- Log each consolidation
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info',
      'Consolidated duplicate sources',
      jsonb_build_object(
        'canonical_domain', source_record.canonical_domain,
        'kept_source_id', canonical_source_id,
        'removed_count', array_length(source_record.source_ids, 1) - 1,
        'duplicate_ids', source_record.source_ids[2:]
      ),
      'cleanup_orphaned_sources'
    );
  END LOOP;
  
  -- Log overall cleanup
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Source cleanup completed',
    jsonb_build_object(
      'orphaned_sources_removed', orphaned_count,
      'duplicate_sources_consolidated', duplicate_count
    ),
    'cleanup_orphaned_sources'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'orphaned_sources_removed', orphaned_count,
    'duplicate_sources_consolidated', duplicate_count,
    'message', format('Cleanup complete: removed %s orphaned sources and consolidated %s duplicates', 
                     orphaned_count, duplicate_count)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Function to fix Sussex Express specifically
CREATE OR REPLACE FUNCTION public.fix_sussex_express_sources()
RETURNS jsonb 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  canonical_source_id UUID;
  eastbourne_topic_id UUID := 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';
  sources_consolidated INTEGER := 0;
BEGIN
  -- Find the best Sussex Express source (RSS feed preferred)
  SELECT id INTO canonical_source_id
  FROM content_sources 
  WHERE canonical_domain LIKE '%sussexexpress%' 
    OR source_name ILIKE '%sussex express%'
  ORDER BY 
    CASE WHEN feed_url LIKE '%/rss%' THEN 1 ELSE 2 END,
    articles_scraped DESC NULLS LAST,
    created_at ASC
  LIMIT 1;
  
  IF canonical_source_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No Sussex Express source found'
    );
  END IF;
  
  -- Update the canonical source to ensure it has the correct RSS feed
  UPDATE content_sources 
  SET 
    feed_url = 'https://www.sussexexpress.co.uk/news/local/eastbourne/rss',
    source_name = 'Sussex Express Eastbourne',
    canonical_domain = 'sussexexpress.co.uk',
    is_active = true,
    updated_at = now()
  WHERE id = canonical_source_id;
  
  -- Count duplicates before consolidation
  SELECT count(*) - 1 INTO sources_consolidated
  FROM content_sources 
  WHERE (canonical_domain LIKE '%sussexexpress%' OR source_name ILIKE '%sussex express%')
    AND id != canonical_source_id;
  
  -- Remove topic_sources for duplicates first
  DELETE FROM topic_sources 
  WHERE source_id IN (
    SELECT id FROM content_sources 
    WHERE (canonical_domain LIKE '%sussexexpress%' OR source_name ILIKE '%sussex express%')
      AND id != canonical_source_id
  );
  
  -- Update articles to point to canonical source
  UPDATE articles 
  SET source_id = canonical_source_id
  WHERE source_id IN (
    SELECT id FROM content_sources 
    WHERE (canonical_domain LIKE '%sussexexpress%' OR source_name ILIKE '%sussex express%')
      AND id != canonical_source_id
  );
  
  -- Remove duplicate sources
  DELETE FROM content_sources 
  WHERE (canonical_domain LIKE '%sussexexpress%' OR source_name ILIKE '%sussex express%')
    AND id != canonical_source_id;
  
  -- Ensure the canonical source is linked to Eastbourne topic
  INSERT INTO topic_sources (topic_id, source_id, is_active)
  VALUES (eastbourne_topic_id, canonical_source_id, true)
  ON CONFLICT (topic_id, source_id) 
  DO UPDATE SET is_active = true, updated_at = now();
  
  RETURN jsonb_build_object(
    'success', true,
    'canonical_source_id', canonical_source_id,
    'duplicates_removed', sources_consolidated,
    'message', format('Fixed Sussex Express: kept source %s, removed %s duplicates', 
                     canonical_source_id, sources_consolidated)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;