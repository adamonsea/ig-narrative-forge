-- Create stories table
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  generated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create slides table
CREATE TABLE IF NOT EXISTS public.slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  slide_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  visual_prompt TEXT,
  alt_text TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

-- Create policies for stories
CREATE POLICY "Users can view all stories" 
ON public.stories 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create stories" 
ON public.stories 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update stories" 
ON public.stories 
FOR UPDATE 
USING (true);

-- Create policies for slides
CREATE POLICY "Users can view all slides" 
ON public.slides 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create slides" 
ON public.slides 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update slides" 
ON public.slides 
FOR UPDATE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_stories_updated_at
  BEFORE UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_slides_updated_at
  BEFORE UPDATE ON public.slides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stories_article_id ON public.stories(article_id);
CREATE INDEX IF NOT EXISTS idx_stories_status ON public.stories(status);
CREATE INDEX IF NOT EXISTS idx_slides_story_id ON public.slides(story_id);
CREATE INDEX IF NOT EXISTS idx_slides_slide_number ON public.slides(story_id, slide_number);