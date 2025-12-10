-- Add sift_enabled column to topic_insight_settings
ALTER TABLE public.topic_insight_settings 
ADD COLUMN IF NOT EXISTS sift_enabled boolean DEFAULT false;

-- Enable for test feeds (Eastbourne, Kenilworth, Medical Device Development)
UPDATE public.topic_insight_settings tis
SET sift_enabled = true
FROM public.topics t
WHERE tis.topic_id = t.id
AND t.slug IN ('eastbourne', 'kenilworth', 'medical-device-development');

-- Add comment
COMMENT ON COLUMN public.topic_insight_settings.sift_enabled IS 'Premium feature: enables Photo Pile/Sift mode for topic';