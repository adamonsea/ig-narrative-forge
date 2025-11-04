
-- Redistribute misplaced articles from Eastbourne to correct topics

-- First, get the topic IDs we'll need
DO $$
DECLARE
  eastbourne_id UUID;
  hastings_id UUID;
  medical_id UUID;
BEGIN
  SELECT id INTO eastbourne_id FROM topics WHERE name = 'Eastbourne';
  SELECT id INTO hastings_id FROM topics WHERE name = 'Hastings';
  SELECT id INTO medical_id FROM topics WHERE name = 'Medical Devices';

  -- Move Hastings-specific articles from Eastbourne to Hastings
  UPDATE topic_articles ta
  SET topic_id = hastings_id,
      regional_relevance_score = 95  -- High score since we're manually moving
  FROM shared_article_content sac
  WHERE ta.shared_content_id = sac.id
    AND ta.topic_id = eastbourne_id
    AND ta.processing_status = 'new'
    AND (
      sac.title ILIKE '%hastings%' OR
      sac.title ILIKE '%st leonards%' OR
      sac.title ILIKE '%st. leonards%' OR
      sac.title ILIKE '%priory meadow%' OR
      sac.title ILIKE '%fairlight%' OR
      sac.title ILIKE '%winchelsea%' OR
      sac.title ILIKE '%battle %' OR
      sac.title ILIKE '%bexhill%' OR
      sac.title ILIKE '%rye %' OR
      sac.title ILIKE '%1066%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM topic_articles ta2
      WHERE ta2.shared_content_id = ta.shared_content_id
        AND ta2.topic_id = hastings_id
    );

  -- Delete articles from Eastbourne that are clearly outside both regions
  DELETE FROM topic_articles ta
  USING shared_article_content sac
  WHERE ta.shared_content_id = sac.id
    AND ta.topic_id = eastbourne_id
    AND ta.processing_status = 'new'
    AND (
      sac.title ILIKE '%lewes %' OR
      sac.title ILIKE '%uckfield%' OR
      sac.title ILIKE '%burgess hill%' OR
      sac.title ILIKE '%shoreham%' OR
      sac.title ILIKE '%brighton%' OR
      sac.title ILIKE '%worthing%' OR
      sac.title ILIKE '%crawley%' OR
      sac.title ILIKE '%horsham%' OR
      sac.title ILIKE '%chichester%' OR
      sac.title ILIKE '%midhurst%' OR
      sac.title ILIKE '%northiam%' OR
      sac.title ILIKE '%rodmell%' OR
      sac.title ILIKE '%southease%'
    );

  -- Delete generic non-local articles (Amazon deals, generic political statements without local context)
  DELETE FROM topic_articles ta
  USING shared_article_content sac
  WHERE ta.shared_content_id = sac.id
    AND ta.topic_id = eastbourne_id
    AND ta.processing_status = 'new'
    AND (
      sac.title ILIKE '%amazon%' OR
      sac.title ILIKE '%treadmill%' OR
      sac.title ILIKE '%stay fit indoors%'
    );

END $$;
