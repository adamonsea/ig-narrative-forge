-- Add missing tone column to stories table
ALTER TABLE public.stories 
ADD COLUMN tone TEXT DEFAULT 'conversational' CHECK (tone IN ('formal', 'conversational', 'engaging'));

-- Add missing writing_style column to stories table  
ALTER TABLE public.stories 
ADD COLUMN writing_style TEXT DEFAULT 'journalistic' CHECK (writing_style IN ('journalistic', 'educational', 'listicle', 'story_driven'));

-- Add missing slide_type column to stories table
ALTER TABLE public.stories 
ADD COLUMN slide_type TEXT DEFAULT 'tabloid' CHECK (slide_type IN ('short', 'tabloid', 'indepth', 'extensive'));

-- Update any existing stories to have default values
UPDATE public.stories 
SET tone = 'conversational', writing_style = 'journalistic', slide_type = 'tabloid'
WHERE tone IS NULL OR writing_style IS NULL OR slide_type IS NULL;