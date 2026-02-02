-- Add lifecycle tracking timestamps and automation flags to stories table
ALTER TABLE public.stories
ADD COLUMN IF NOT EXISTS simplified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS animation_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_auto_gathered BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_auto_simplified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_auto_illustrated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_auto_animated BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.stories.simplified_at IS 'Timestamp when story content was simplified/generated';
COMMENT ON COLUMN public.stories.animation_generated_at IS 'Timestamp when video animation was generated';
COMMENT ON COLUMN public.stories.is_auto_gathered IS 'Whether the article was gathered automatically (holiday mode)';
COMMENT ON COLUMN public.stories.is_auto_simplified IS 'Whether simplification was done automatically';
COMMENT ON COLUMN public.stories.is_auto_illustrated IS 'Whether illustration was generated automatically';
COMMENT ON COLUMN public.stories.is_auto_animated IS 'Whether animation was generated automatically';