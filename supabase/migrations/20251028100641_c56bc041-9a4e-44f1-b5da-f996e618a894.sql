-- Phase 6: Data Reconciliation
-- Re-link orphaned articles and recalculate metrics

-- Step 1: Re-link orphaned articles to sources based on source_url domain matching
DO $$
DECLARE
  v_relinked_count integer := 0;
BEGIN
  -- Try to match orphaned articles back to sources by domain
  WITH orphaned_articles AS (
    SELECT 
      a.id as article_id,
      a.source_url,
      cs.id as source_id
    FROM articles a
    CROSS JOIN content_sources cs
    WHERE a.source_id IS NULL
      AND a.source_url IS NOT NULL
      AND a.source_url LIKE '%' || cs.canonical_domain || '%'
  ),
  unique_matches AS (
    -- Only update if there's exactly one match to avoid ambiguity
    SELECT article_id, source_id
    FROM orphaned_articles
    GROUP BY article_id, source_id
  )
  UPDATE articles
  SET source_id = unique_matches.source_id
  FROM unique_matches
  WHERE articles.id = unique_matches.article_id;
  
  GET DIAGNOSTICS v_relinked_count = ROW_COUNT;
  RAISE NOTICE 'Re-linked % orphaned articles to sources', v_relinked_count;
END $$;

-- Step 2: Recalculate articles_scraped counts for all sources
DO $$
BEGIN
  UPDATE content_sources cs
  SET articles_scraped = COALESCE((
    SELECT COUNT(DISTINCT ta.id)
    FROM topic_articles ta
    WHERE ta.source_id = cs.id
  ), 0);
  
  RAISE NOTICE 'Recalculated articles_scraped counts for all sources';
END $$;

-- Step 3: Update last_scraped_at for sources that have articles but NULL timestamp
DO $$
BEGIN
  UPDATE content_sources cs
  SET last_scraped_at = (
    SELECT MAX(ta.created_at)
    FROM topic_articles ta
    WHERE ta.source_id = cs.id
  )
  WHERE last_scraped_at IS NULL
    AND EXISTS (
      SELECT 1 FROM topic_articles ta 
      WHERE ta.source_id = cs.id
    );
  
  RAISE NOTICE 'Updated last_scraped_at for sources with articles';
END $$;

-- Log summary
DO $$
DECLARE
  v_orphaned_count integer;
  v_zero_count integer;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_count
  FROM articles
  WHERE source_id IS NULL;
  
  SELECT COUNT(*) INTO v_zero_count
  FROM content_sources
  WHERE articles_scraped = 0;
  
  RAISE NOTICE '=== Reconciliation Summary ===';
  RAISE NOTICE 'Remaining orphaned articles: %', v_orphaned_count;
  RAISE NOTICE 'Sources with 0 articles: %', v_zero_count;
END $$;