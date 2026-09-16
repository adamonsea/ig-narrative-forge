ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS locality_strength smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS nearby_places jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS big_story_override boolean NOT NULL DEFAULT true;

ALTER TABLE public.topic_articles
  ADD COLUMN IF NOT EXISTS place_tier text;

CREATE OR REPLACE FUNCTION public.validate_locality_strength()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.locality_strength IS NULL OR NEW.locality_strength < 1 OR NEW.locality_strength > 5 THEN
    RAISE EXCEPTION 'locality_strength must be between 1 and 5';
  END IF;
  IF jsonb_typeof(NEW.nearby_places) <> 'array' THEN
    RAISE EXCEPTION 'nearby_places must be a JSON array';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_locality_strength_trigger ON public.topics;
CREATE TRIGGER validate_locality_strength_trigger
  BEFORE INSERT OR UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.validate_locality_strength();

UPDATE public.topics t
SET nearby_places = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', r, 'tier', 'far')), '[]'::jsonb)
  FROM unnest(t.competing_regions) AS r
  WHERE r IS NOT NULL AND length(trim(r)) > 0
)
WHERE t.competing_regions IS NOT NULL
  AND array_length(t.competing_regions, 1) > 0
  AND t.nearby_places = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_topic_articles_place_tier ON public.topic_articles(topic_id, place_tier);