-- Make article_id nullable on content_generation_queue for multi-tenant jobs
ALTER TABLE public.content_generation_queue ALTER COLUMN article_id DROP NOT NULL;