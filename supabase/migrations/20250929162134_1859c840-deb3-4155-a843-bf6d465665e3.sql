-- Create story_cover_options table to store multiple cover variations
CREATE TABLE public.story_cover_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  cover_url TEXT NOT NULL,
  generation_prompt TEXT,
  model_used TEXT,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX idx_story_cover_options_story_id ON public.story_cover_options(story_id);
CREATE INDEX idx_story_cover_options_generated_at ON public.story_cover_options(generated_at DESC);

-- Add selected_cover_id to stories table to track which cover is selected
ALTER TABLE public.stories 
ADD COLUMN selected_cover_id UUID REFERENCES public.story_cover_options(id) ON DELETE SET NULL;

-- Enable RLS on the new table
ALTER TABLE public.story_cover_options ENABLE ROW LEVEL SECURITY;

-- RLS policies for story_cover_options
CREATE POLICY "Story cover options viewable by story owners" 
ON public.story_cover_options 
FOR SELECT 
USING (
  story_id IN (
    SELECT s.id FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE t.created_by = auth.uid()
  ) OR 
  story_id IN (
    SELECT s.id FROM public.stories s
    JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    JOIN public.topics t ON t.id = ta.topic_id
    WHERE t.created_by = auth.uid()
  ) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Story cover options manageable by story owners" 
ON public.story_cover_options 
FOR ALL 
USING (
  story_id IN (
    SELECT s.id FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE t.created_by = auth.uid()
  ) OR 
  story_id IN (
    SELECT s.id FROM public.stories s
    JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    JOIN public.topics t ON t.id = ta.topic_id
    WHERE t.created_by = auth.uid()
  ) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.role() = 'service_role'
)
WITH CHECK (
  story_id IN (
    SELECT s.id FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE t.created_by = auth.uid()
  ) OR 
  story_id IN (
    SELECT s.id FROM public.stories s
    JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    JOIN public.topics t ON t.id = ta.topic_id
    WHERE t.created_by = auth.uid()
  ) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.role() = 'service_role'
);

-- Migrate existing cover_illustration_url values to the new table
INSERT INTO public.story_cover_options (story_id, cover_url, generation_prompt, model_used, generated_at)
SELECT 
  id,
  cover_illustration_url,
  cover_illustration_prompt,
  'legacy_migration',
  COALESCE(illustration_generated_at, created_at)
FROM public.stories 
WHERE cover_illustration_url IS NOT NULL;

-- Update stories table to reference the migrated covers as selected
UPDATE public.stories 
SET selected_cover_id = sco.id
FROM public.story_cover_options sco
WHERE sco.story_id = stories.id 
  AND sco.model_used = 'legacy_migration'
  AND stories.cover_illustration_url IS NOT NULL;