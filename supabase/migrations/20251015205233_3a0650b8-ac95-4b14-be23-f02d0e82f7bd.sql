-- Add events_enabled column to topics table
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS events_enabled boolean DEFAULT false;

COMMENT ON COLUMN public.topics.events_enabled IS 'Controls whether events are displayed in the topic feed';

-- Enable events for Eastbourne topic (it's already using events)
UPDATE public.topics 
SET events_enabled = true 
WHERE slug = 'eastbourne';