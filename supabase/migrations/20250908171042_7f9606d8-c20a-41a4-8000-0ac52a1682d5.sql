-- Phase 1: Create Multi-Tenant Article Schema Alongside Existing Structure

-- Table to store deduplicated article content (one record per unique article)
CREATE TABLE IF NOT EXISTS public.shared_article_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  normalized_url TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  author TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  image_url TEXT,
  canonical_url TEXT,
  content_checksum TEXT GENERATED ALWAYS AS (
    encode(digest(COALESCE(title, '') || COALESCE(body, '') || COALESCE(author, ''), 'sha256'), 'hex')
  ) STORED,
  word_count INTEGER DEFAULT 0,
  language TEXT DEFAULT 'en',
  source_domain TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Junction table linking shared content to specific topics with topic-specific metadata
CREATE TABLE IF NOT EXISTS public.topic_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shared_content_id UUID NOT NULL REFERENCES public.shared_article_content(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.content_sources(id) ON DELETE SET NULL,
  
  -- Topic-specific scores and metadata
  regional_relevance_score INTEGER DEFAULT 0,
  content_quality_score INTEGER DEFAULT 0,
  keyword_matches TEXT[] DEFAULT '{}',
  
  -- Topic-specific processing status
  processing_status TEXT NOT NULL DEFAULT 'new' CHECK (processing_status IN ('new', 'processing', 'processed', 'discarded')),
  
  -- Topic-specific metadata
  import_metadata JSONB DEFAULT '{}',
  originality_confidence INTEGER DEFAULT 100,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one record per content-topic pair
  UNIQUE(shared_content_id, topic_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shared_content_normalized_url ON public.shared_article_content(normalized_url);
CREATE INDEX IF NOT EXISTS idx_shared_content_checksum ON public.shared_article_content(content_checksum);
CREATE INDEX IF NOT EXISTS idx_shared_content_domain ON public.shared_article_content(source_domain);
CREATE INDEX IF NOT EXISTS idx_topic_articles_topic_id ON public.topic_articles(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_articles_status ON public.topic_articles(processing_status);
CREATE INDEX IF NOT EXISTS idx_topic_articles_created ON public.topic_articles(created_at);

-- Enable RLS on new tables
ALTER TABLE public.shared_article_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_articles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shared_article_content (readable by all authenticated users)
CREATE POLICY "Shared content readable by authenticated users"
ON public.shared_article_content
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage shared content"
ON public.shared_article_content
FOR ALL
USING (auth.role() = 'service_role');

-- RLS Policies for topic_articles (topic-scoped access)
CREATE POLICY "Topic articles viewable by topic owners"
ON public.topic_articles
FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM topics 
    WHERE created_by = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.role() = 'service_role'
);

CREATE POLICY "Topic articles manageable by topic owners"
ON public.topic_articles
FOR ALL
USING (
  topic_id IN (
    SELECT id FROM topics 
    WHERE created_by = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.role() = 'service_role'
)
WITH CHECK (
  topic_id IN (
    SELECT id FROM topics 
    WHERE created_by = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.role() = 'service_role'
);

-- Function to migrate existing articles to new structure (for testing)
CREATE OR REPLACE FUNCTION public.migrate_articles_to_multi_tenant(p_limit INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  migrated_count INTEGER := 0;
  article_record RECORD;
  content_id UUID;
BEGIN
  -- Migrate articles in batches
  FOR article_record IN 
    SELECT * FROM articles 
    WHERE topic_id IS NOT NULL 
    ORDER BY created_at 
    LIMIT p_limit
  LOOP
    -- Insert or get shared content
    INSERT INTO shared_article_content (
      url, normalized_url, title, body, author, published_at, 
      image_url, canonical_url, word_count, language, source_domain,
      created_at, updated_at, last_seen_at
    )
    VALUES (
      article_record.source_url,
      normalize_url(article_record.source_url),
      article_record.title,
      article_record.body,
      article_record.author,
      article_record.published_at,
      article_record.image_url,
      article_record.canonical_url,
      article_record.word_count,
      COALESCE(article_record.language, 'en'),
      CASE 
        WHEN article_record.source_url ~ '^https?://([^/]+)' 
        THEN substring(article_record.source_url from '^https?://([^/]+)')
        ELSE NULL
      END,
      article_record.created_at,
      article_record.updated_at,
      article_record.updated_at
    )
    ON CONFLICT (url) 
    DO UPDATE SET 
      last_seen_at = now(),
      updated_at = now()
    RETURNING id INTO content_id;
    
    -- If no content_id returned, get existing one
    IF content_id IS NULL THEN
      SELECT id INTO content_id 
      FROM shared_article_content 
      WHERE url = article_record.source_url;
    END IF;
    
    -- Insert topic-specific article record
    INSERT INTO topic_articles (
      shared_content_id, topic_id, source_id,
      regional_relevance_score, content_quality_score,
      processing_status, import_metadata, originality_confidence,
      created_at, updated_at
    )
    VALUES (
      content_id,
      article_record.topic_id,
      article_record.source_id,
      article_record.regional_relevance_score,
      article_record.content_quality_score,
      article_record.processing_status,
      article_record.import_metadata,
      article_record.originality_confidence,
      article_record.created_at,
      article_record.updated_at
    )
    ON CONFLICT (shared_content_id, topic_id) DO NOTHING;
    
    migrated_count := migrated_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'migrated_count', migrated_count,
    'message', 'Articles migrated to multi-tenant structure'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Function to get articles for a topic using new structure
CREATE OR REPLACE FUNCTION public.get_topic_articles_multi_tenant(
  p_topic_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  shared_content_id UUID,
  title TEXT,
  body TEXT,
  author TEXT,
  url TEXT,
  image_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  word_count INTEGER,
  processing_status TEXT,
  regional_relevance_score INTEGER,
  content_quality_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ta.id,
    ta.shared_content_id,
    sc.title,
    sc.body,
    sc.author,
    sc.url,
    sc.image_url,
    sc.published_at,
    sc.word_count,
    ta.processing_status,
    ta.regional_relevance_score,
    ta.content_quality_score,
    ta.created_at,
    ta.updated_at
  FROM topic_articles ta
  JOIN shared_article_content sc ON sc.id = ta.shared_content_id
  WHERE ta.topic_id = p_topic_id
    AND (p_status IS NULL OR ta.processing_status = p_status)
  ORDER BY ta.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Log the schema creation
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Multi-tenant article schema created alongside existing structure',
  jsonb_build_object(
    'phase', 'migration_phase_1',
    'tables_created', ARRAY['shared_article_content', 'topic_articles'],
    'migration_safe', true
  ),
  'multi_tenant_migration_phase_1'
);