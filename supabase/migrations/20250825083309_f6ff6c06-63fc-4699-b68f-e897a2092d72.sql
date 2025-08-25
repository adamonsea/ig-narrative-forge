-- Create carousel_exports table for tracking generated carousel image sets
CREATE TABLE IF NOT EXISTS public.carousel_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  export_formats JSONB NOT NULL DEFAULT '{}',
  file_paths JSONB NOT NULL DEFAULT '[]',
  zip_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.carousel_exports ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Carousel exports viewable by authenticated users" 
ON public.carousel_exports 
FOR SELECT 
USING (true);

CREATE POLICY "Carousel exports manageable by authenticated users" 
ON public.carousel_exports 
FOR ALL 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_carousel_exports_updated_at
BEFORE UPDATE ON public.carousel_exports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_carousel_exports_story_id ON public.carousel_exports(story_id);
CREATE INDEX idx_carousel_exports_status ON public.carousel_exports(status);