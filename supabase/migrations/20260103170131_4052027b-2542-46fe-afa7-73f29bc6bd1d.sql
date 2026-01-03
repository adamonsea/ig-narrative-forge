-- Add 'rhyming_couplet' to the tone_type enum
ALTER TYPE tone_type ADD VALUE IF NOT EXISTS 'rhyming_couplet';

-- Update stories table tone constraint to include rhyming_couplet
ALTER TABLE public.stories 
DROP CONSTRAINT IF EXISTS stories_tone_check;

ALTER TABLE public.stories 
ADD CONSTRAINT stories_tone_check 
CHECK (tone IN ('formal', 'conversational', 'engaging', 'satirical', 'rhyming_couplet'));

-- Update topics table default_tone constraint to include rhyming_couplet
ALTER TABLE public.topics 
DROP CONSTRAINT IF EXISTS topics_default_tone_check;

ALTER TABLE public.topics 
ADD CONSTRAINT topics_default_tone_check 
CHECK (default_tone::text IN ('formal', 'conversational', 'engaging', 'satirical', 'rhyming_couplet'));