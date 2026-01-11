-- Add country_code column to site_visits table
ALTER TABLE public.site_visits 
ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Add index for efficient country-based queries
CREATE INDEX IF NOT EXISTS idx_site_visits_country_topic 
ON public.site_visits(topic_id, country_code) 
WHERE country_code IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.site_visits.country_code IS 'ISO 3166-1 alpha-2 country code of visitor (e.g., GB, US)';