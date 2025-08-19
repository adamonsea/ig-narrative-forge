-- Phase 2: Add processing status to articles table
ALTER TABLE public.articles 
ADD COLUMN processing_status text NOT NULL DEFAULT 'new';

-- Add check constraint for valid statuses
ALTER TABLE public.articles 
ADD CONSTRAINT articles_processing_status_check 
CHECK (processing_status IN ('new', 'processing', 'processed', 'discarded', 'archived'));

-- Create index for better query performance
CREATE INDEX idx_articles_processing_status ON public.articles(processing_status);

-- Update existing articles that have been processed (have stories) to 'processed' status
UPDATE public.articles 
SET processing_status = 'processed' 
WHERE id IN (
  SELECT DISTINCT article_id 
  FROM public.stories 
  WHERE article_id IS NOT NULL
);