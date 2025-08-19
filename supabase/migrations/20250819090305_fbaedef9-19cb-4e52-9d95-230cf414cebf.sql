-- Phase 1: Enable pg_trgm extension for similarity detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Phase 2: Create duplicate detection tables
CREATE TABLE IF NOT EXISTS public.article_duplicates_pending (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  duplicate_article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  similarity_score NUMERIC NOT NULL,
  detection_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, merged, ignored
  merged_at TIMESTAMP WITH TIME ZONE,
  merged_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies for duplicate detection
ALTER TABLE public.article_duplicates_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Duplicate detection viewable by authenticated users" 
ON public.article_duplicates_pending 
FOR SELECT 
USING (true);

CREATE POLICY "Duplicate detection manageable by authenticated users" 
ON public.article_duplicates_pending 
FOR ALL 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_article_duplicates_pending_updated_at
  BEFORE UPDATE ON public.article_duplicates_pending
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 3: Add content length validation and quality metrics
ALTER TABLE public.articles 
ADD COLUMN IF NOT EXISTS content_quality_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS extraction_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_extraction_attempt TIMESTAMP WITH TIME ZONE;

-- Phase 4: Create duplicate detection function
CREATE OR REPLACE FUNCTION public.detect_article_duplicates(p_article_id UUID)
RETURNS TABLE(duplicate_id UUID, similarity_score NUMERIC, detection_method TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Find duplicates based on title similarity using pg_trgm
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    similarity(a.title, ref.title)::NUMERIC as similarity_score,
    'title_similarity'::TEXT as detection_method
  FROM public.articles a
  CROSS JOIN (
    SELECT title FROM public.articles WHERE id = p_article_id
  ) ref
  WHERE a.id != p_article_id
    AND a.processing_status = 'new' -- Only check against unprocessed articles
    AND similarity(a.title, ref.title) >= 0.7
  ORDER BY similarity_score DESC;
END;
$$;

-- Phase 5: Update processing status for existing articles
UPDATE public.articles 
SET processing_status = 'processed' 
WHERE id IN (
  SELECT DISTINCT article_id FROM public.stories
) AND processing_status = 'new';

-- Set archived/discarded articles based on import_metadata
UPDATE public.articles 
SET processing_status = 'discarded'
WHERE (import_metadata->>'rejected')::boolean = true
  AND processing_status = 'new';

-- Create index for better duplicate detection performance
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON public.articles USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_processing_status ON public.articles(processing_status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles(created_at DESC);