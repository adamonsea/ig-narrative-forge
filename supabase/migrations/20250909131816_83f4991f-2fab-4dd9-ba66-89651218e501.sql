-- Phase 1: Add multi-tenant tracking columns to existing tables

-- Add multi-tenant tracking columns to content_generation_queue
ALTER TABLE content_generation_queue 
ADD COLUMN topic_article_id UUID REFERENCES topic_articles(id),
ADD COLUMN shared_content_id UUID REFERENCES shared_article_content(id);

-- Add multi-tenant tracking columns to stories
ALTER TABLE stories 
ADD COLUMN topic_article_id UUID REFERENCES topic_articles(id),
ADD COLUMN shared_content_id UUID REFERENCES shared_article_content(id);

-- Phase 2: Create bridge database functions for unified content access

-- Function to get unified article content from either legacy or multi-tenant structure
CREATE OR REPLACE FUNCTION get_article_content_unified(
  p_article_id UUID DEFAULT NULL,
  p_topic_article_id UUID DEFAULT NULL,
  p_shared_content_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  body TEXT,
  author TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  source_url TEXT,
  image_url TEXT,
  canonical_url TEXT,
  word_count INTEGER,
  processing_status TEXT,
  content_quality_score INTEGER,
  regional_relevance_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  source_type TEXT -- 'legacy' or 'multi_tenant'
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- If legacy article_id provided, return legacy article
  IF p_article_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      a.id,
      a.title,
      a.body,
      a.author,
      a.published_at,
      a.source_url,
      a.image_url,
      a.canonical_url,
      a.word_count,
      a.processing_status,
      a.content_quality_score,
      a.regional_relevance_score,
      a.created_at,
      a.updated_at,
      'legacy'::TEXT as source_type
    FROM articles a
    WHERE a.id = p_article_id;
    RETURN;
  END IF;

  -- If multi-tenant IDs provided, return multi-tenant article
  IF p_topic_article_id IS NOT NULL OR p_shared_content_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      ta.id,
      sac.title,
      sac.body,
      sac.author,
      sac.published_at,
      sac.url as source_url,
      sac.image_url,
      sac.canonical_url,
      sac.word_count,
      ta.processing_status,
      ta.content_quality_score,
      ta.regional_relevance_score,
      ta.created_at,
      ta.updated_at,
      'multi_tenant'::TEXT as source_type
    FROM topic_articles ta
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    WHERE (p_topic_article_id IS NULL OR ta.id = p_topic_article_id)
      AND (p_shared_content_id IS NULL OR ta.shared_content_id = p_shared_content_id);
    RETURN;
  END IF;

  -- No valid IDs provided
  RETURN;
END;
$$;

-- Function to queue multi-tenant articles for content generation
CREATE OR REPLACE FUNCTION queue_multi_tenant_article(
  p_topic_article_id UUID,
  p_shared_content_id UUID,
  p_slidetype TEXT DEFAULT 'tabloid',
  p_tone tone_type DEFAULT 'conversational',
  p_writing_style TEXT DEFAULT 'journalistic',
  p_ai_provider TEXT DEFAULT 'deepseek'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  queue_id UUID;
BEGIN
  -- Insert into content generation queue with multi-tenant IDs
  INSERT INTO content_generation_queue (
    article_id, -- Keep NULL for multi-tenant
    topic_article_id,
    shared_content_id,
    slidetype,
    tone,
    writing_style,
    ai_provider,
    status,
    created_at
  ) VALUES (
    NULL, -- Legacy article_id is NULL for multi-tenant
    p_topic_article_id,
    p_shared_content_id,
    p_slidetype,
    p_tone,
    p_writing_style,
    p_ai_provider,
    'pending',
    NOW()
  ) RETURNING id INTO queue_id;
  
  -- Update topic article status to processed
  UPDATE topic_articles 
  SET processing_status = 'processed',
      updated_at = NOW()
  WHERE id = p_topic_article_id;
  
  RETURN queue_id;
END;
$$;

-- Function to create stories from multi-tenant articles
CREATE OR REPLACE FUNCTION create_story_from_multi_tenant(
  p_topic_article_id UUID,
  p_shared_content_id UUID,
  p_title TEXT,
  p_status TEXT DEFAULT 'draft'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  story_id UUID;
BEGIN
  -- Insert story with both legacy and multi-tenant references
  INSERT INTO stories (
    article_id, -- Keep NULL for multi-tenant stories
    topic_article_id,
    shared_content_id,
    title,
    status,
    created_at
  ) VALUES (
    NULL, -- Legacy article_id is NULL for multi-tenant
    p_topic_article_id,
    p_shared_content_id,
    p_title,
    p_status,
    NOW()
  ) RETURNING id INTO story_id;
  
  RETURN story_id;
END;
$$;

-- Function to get queue items with unified structure
CREATE OR REPLACE FUNCTION get_queue_items_unified(p_topic_id UUID DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  article_id UUID,
  topic_article_id UUID,
  shared_content_id UUID,
  title TEXT,
  status TEXT,
  slidetype TEXT,
  tone tone_type,
  writing_style TEXT,
  ai_provider TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  source_type TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.article_id,
    q.topic_article_id,
    q.shared_content_id,
    COALESCE(
      a.title, -- Legacy title
      sac.title -- Multi-tenant title
    ) as title,
    q.status,
    q.slidetype,
    q.tone,
    q.writing_style,
    q.ai_provider,
    q.created_at,
    CASE 
      WHEN q.article_id IS NOT NULL THEN 'legacy'
      ELSE 'multi_tenant'
    END::TEXT as source_type
  FROM content_generation_queue q
  LEFT JOIN articles a ON a.id = q.article_id
  LEFT JOIN topic_articles ta ON ta.id = q.topic_article_id
  LEFT JOIN shared_article_content sac ON sac.id = q.shared_content_id
  WHERE (p_topic_id IS NULL OR a.topic_id = p_topic_id OR ta.topic_id = p_topic_id)
  ORDER BY q.created_at DESC;
END;
$$;

-- Function to get stories with unified structure  
CREATE OR REPLACE FUNCTION get_stories_unified(p_topic_id UUID DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  article_id UUID,
  topic_article_id UUID,
  shared_content_id UUID,
  title TEXT,
  status TEXT,
  is_published BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  slides_count INTEGER,
  source_type TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    END::TEXT as source_type
  FROM stories s
  LEFT JOIN articles a ON a.id = s.article_id
  LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id
  WHERE (p_topic_id IS NULL OR a.topic_id = p_topic_id OR ta.topic_id = p_topic_id)
  ORDER BY s.created_at DESC;
END;
$$;