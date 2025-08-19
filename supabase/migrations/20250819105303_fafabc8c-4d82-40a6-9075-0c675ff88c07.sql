-- Create content generation queue table
CREATE TABLE IF NOT EXISTS public.content_generation_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  slideType TEXT NOT NULL DEFAULT 'tabloid',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  result_data JSONB
);

-- Enable RLS
ALTER TABLE public.content_generation_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Content generation queue manageable by authenticated users" 
ON public.content_generation_queue 
FOR ALL 
USING (true);

-- Create index for efficient queue processing
CREATE INDEX idx_content_generation_queue_status_created 
ON public.content_generation_queue(status, created_at) 
WHERE status = 'pending';

-- Create index for article lookups
CREATE INDEX idx_content_generation_queue_article_id 
ON public.content_generation_queue(article_id);