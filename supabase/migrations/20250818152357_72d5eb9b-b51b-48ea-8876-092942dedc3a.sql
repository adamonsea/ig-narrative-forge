-- Add missing columns and indexes for Phase 1 Content Management

-- Update articles table with additional metadata fields
ALTER TABLE public.articles 
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS keywords TEXT[];

-- Update content_sources table for enhanced source management
ALTER TABLE public.content_sources 
ADD COLUMN IF NOT EXISTS feed_url TEXT,
ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS scrape_frequency_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS articles_scraped INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS success_rate NUMERIC(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'news',
ADD COLUMN IF NOT EXISTS is_whitelisted BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT false;

-- Create article_duplicates table for deduplication tracking
CREATE TABLE IF NOT EXISTS public.article_duplicates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  duplicate_article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,2) NOT NULL,
  detection_method TEXT NOT NULL, -- 'checksum', 'title', 'content', 'url'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(original_article_id, duplicate_article_id)
);

-- Create search_queries table for search analytics
CREATE TABLE IF NOT EXISTS public.search_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_text TEXT NOT NULL,
  user_id UUID,
  results_count INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  filters JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create saved_filters table for user saved searches
CREATE TABLE IF NOT EXISTS public.saved_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.article_duplicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

-- RLS policies for article_duplicates
CREATE POLICY "Article duplicates viewable by authenticated users"
ON public.article_duplicates FOR SELECT
USING (true);

CREATE POLICY "Article duplicates insert by authenticated"
ON public.article_duplicates FOR INSERT
WITH CHECK (true);

-- RLS policies for search_queries
CREATE POLICY "Search queries viewable by owner or admin"
ON public.search_queries FOR SELECT
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Search queries insert by authenticated"
ON public.search_queries FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS policies for saved_filters
CREATE POLICY "Saved filters viewable by owner or public"
ON public.saved_filters FOR SELECT
USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Saved filters managed by owner"
ON public.saved_filters FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_articles_category ON public.articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_tags ON public.articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_articles_region ON public.articles(region);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON public.articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_word_count ON public.articles(word_count);

CREATE INDEX IF NOT EXISTS idx_content_sources_region ON public.content_sources(region);
CREATE INDEX IF NOT EXISTS idx_content_sources_active ON public.content_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_content_sources_credibility ON public.content_sources(credibility_score DESC);
CREATE INDEX IF NOT EXISTS idx_content_sources_last_scraped ON public.content_sources(last_scraped_at);

CREATE INDEX IF NOT EXISTS idx_search_queries_user ON public.search_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON public.search_queries(created_at DESC);

-- Create function to update article word count and reading time
CREATE OR REPLACE FUNCTION public.update_article_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate word count
  NEW.word_count := CASE
    WHEN NEW.body IS NULL THEN 0
    ELSE COALESCE(array_length(regexp_split_to_array(trim(NEW.body), '\s+'), 1), 0)
  END;
  
  -- Calculate reading time (assuming 200 words per minute)
  NEW.reading_time_minutes := GREATEST(1, ROUND(NEW.word_count / 200.0));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic article metadata updates
DROP TRIGGER IF EXISTS update_article_metadata_trigger ON public.articles;
CREATE TRIGGER update_article_metadata_trigger
  BEFORE INSERT OR UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_article_metadata();

-- Create function for content deduplication
CREATE OR REPLACE FUNCTION public.find_duplicate_articles(
  p_article_id UUID,
  p_similarity_threshold NUMERIC DEFAULT 0.8
)
RETURNS TABLE (
  duplicate_id UUID,
  similarity_score NUMERIC,
  detection_method TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Find duplicates based on content checksum
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    1.0::NUMERIC as similarity_score,
    'checksum'::TEXT as detection_method
  FROM public.articles a
  WHERE a.id != p_article_id
    AND a.content_checksum = (
      SELECT content_checksum 
      FROM public.articles 
      WHERE id = p_article_id
    )
    AND a.content_checksum IS NOT NULL;
  
  -- Find duplicates based on similar titles (using similarity)
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    similarity(a.title, ref.title)::NUMERIC as similarity_score,
    'title'::TEXT as detection_method
  FROM public.articles a
  CROSS JOIN (
    SELECT title FROM public.articles WHERE id = p_article_id
  ) ref
  WHERE a.id != p_article_id
    AND similarity(a.title, ref.title) >= p_similarity_threshold;
END;
$$;