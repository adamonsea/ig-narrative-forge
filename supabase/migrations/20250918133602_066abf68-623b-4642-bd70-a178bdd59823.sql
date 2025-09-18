-- Phase 1: Emergency Database Fix

-- Add missing audience_expertise column to stories table
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS audience_expertise text DEFAULT 'intermediate';

-- Reset all failed queue items back to pending for retry
UPDATE public.content_generation_queue 
SET status = 'pending',
    attempts = 0,
    error_message = NULL,
    started_at = NULL,
    completed_at = NULL
WHERE status = 'failed' OR attempts >= max_attempts;

-- Clear orphaned stories (stories without proper multi-tenant linkage)
DELETE FROM public.stories 
WHERE topic_article_id IS NULL 
  AND shared_content_id IS NULL 
  AND created_at > NOW() - INTERVAL '7 days';

-- Reset processing queue items that have been stuck too long
UPDATE public.content_generation_queue 
SET status = 'pending',
    attempts = 0,
    started_at = NULL
WHERE status = 'processing' 
  AND started_at < NOW() - INTERVAL '30 minutes';