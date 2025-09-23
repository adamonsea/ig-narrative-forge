-- Add links column to slides table for storing link metadata
ALTER TABLE public.slides 
ADD COLUMN links jsonb DEFAULT '[]'::jsonb;

-- Add index for efficient querying of links
CREATE INDEX idx_slides_links ON public.slides USING GIN (links);

-- Add comment to document the links structure
COMMENT ON COLUMN public.slides.links IS 'Array of link objects: [{"start": 10, "end": 20, "url": "https://...", "text": "link text"}]';