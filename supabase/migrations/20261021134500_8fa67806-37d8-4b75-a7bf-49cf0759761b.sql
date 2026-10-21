ALTER TABLE public.topics DROP CONSTRAINT IF EXISTS illustration_style_valid;
ALTER TABLE public.topics ADD CONSTRAINT illustration_style_valid CHECK (
  illustration_style IS NULL OR illustration_style::text IN ('editorial_illustrative','editorial_photographic','cartoon','bw_editorial_photo','anime','illustrated_icon','satirical')
);
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS illustration_gag jsonb;