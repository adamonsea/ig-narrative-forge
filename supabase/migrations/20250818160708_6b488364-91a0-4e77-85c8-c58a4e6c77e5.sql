-- Phase 2: AI Content Generation - Create slide and story management system

-- Create stories table (collections of slides from articles)
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'ready', 'published')),
  slide_count INTEGER DEFAULT 0,
  total_word_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  generated_at TIMESTAMP WITH TIME ZONE
);

-- Create slides table (individual slides within stories)
CREATE TABLE IF NOT EXISTS public.slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  slide_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  visual_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, slide_number)
);

-- Create visuals table (AI-generated or selected images for slides)
CREATE TABLE IF NOT EXISTS public.visuals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  image_url TEXT,
  image_data TEXT, -- Base64 encoded image data
  alt_text TEXT,
  generation_prompt TEXT,
  style_preset TEXT DEFAULT 'editorial',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create posts table (social media posts for different platforms)
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin', 'twitter')),
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- RLS policies for stories
CREATE POLICY "Stories viewable by authenticated users"
ON public.stories FOR SELECT
USING (true);

CREATE POLICY "Stories manageable by authenticated users"
ON public.stories FOR ALL
USING (true);

-- RLS policies for slides
CREATE POLICY "Slides viewable by authenticated users"
ON public.slides FOR SELECT
USING (true);

CREATE POLICY "Slides manageable by authenticated users"
ON public.slides FOR ALL
USING (true);

-- RLS policies for visuals
CREATE POLICY "Visuals viewable by authenticated users"
ON public.visuals FOR SELECT
USING (true);

CREATE POLICY "Visuals manageable by authenticated users"
ON public.visuals FOR ALL
USING (true);

-- RLS policies for posts
CREATE POLICY "Posts viewable by authenticated users"
ON public.posts FOR SELECT
USING (true);

CREATE POLICY "Posts manageable by authenticated users"
ON public.posts FOR ALL
USING (true);

-- Create function to update slide word count automatically
CREATE OR REPLACE FUNCTION public.update_slide_word_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.word_count := CASE
    WHEN NEW.content IS NULL THEN 0
    ELSE COALESCE(array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1), 0)
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic slide word count updates
DROP TRIGGER IF EXISTS update_slide_word_count_trigger ON public.slides;
CREATE TRIGGER update_slide_word_count_trigger
  BEFORE INSERT OR UPDATE ON public.slides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_slide_word_count();

-- Create function to update story metadata when slides change
CREATE OR REPLACE FUNCTION public.update_story_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Update story slide count and total word count
  UPDATE public.stories 
  SET 
    slide_count = (
      SELECT COUNT(*) 
      FROM public.slides 
      WHERE story_id = COALESCE(NEW.story_id, OLD.story_id)
    ),
    total_word_count = (
      SELECT COALESCE(SUM(word_count), 0) 
      FROM public.slides 
      WHERE story_id = COALESCE(NEW.story_id, OLD.story_id)
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.story_id, OLD.story_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update story metadata on slide changes
DROP TRIGGER IF EXISTS update_story_metadata_trigger ON public.slides;
CREATE TRIGGER update_story_metadata_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.slides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_story_metadata();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stories_article_id ON public.stories(article_id);
CREATE INDEX IF NOT EXISTS idx_stories_status ON public.stories(status);
CREATE INDEX IF NOT EXISTS idx_slides_story_id ON public.slides(story_id);
CREATE INDEX IF NOT EXISTS idx_slides_slide_number ON public.slides(story_id, slide_number);
CREATE INDEX IF NOT EXISTS idx_visuals_slide_id ON public.visuals(slide_id);
CREATE INDEX IF NOT EXISTS idx_posts_story_id ON public.posts(story_id);
CREATE INDEX IF NOT EXISTS idx_posts_platform ON public.posts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts(status);