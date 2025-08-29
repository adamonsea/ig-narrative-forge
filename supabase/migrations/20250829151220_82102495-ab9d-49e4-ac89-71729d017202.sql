-- Create a table to track scraped URLs to prevent re-scraping deleted articles
CREATE TABLE IF NOT EXISTS public.scraped_urls_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  topic_id UUID,
  source_id UUID,
  first_scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index on URL to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraped_urls_history_url ON public.scraped_urls_history (url);

-- Enable RLS
ALTER TABLE public.scraped_urls_history ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Authenticated users can view scraped URL history" 
ON public.scraped_urls_history 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert scraped URL history" 
ON public.scraped_urls_history 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update scraped URL history" 
ON public.scraped_urls_history 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);