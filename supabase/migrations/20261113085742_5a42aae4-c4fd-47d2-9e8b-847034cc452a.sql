ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS family_safe boolean NOT NULL DEFAULT false;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS brand_safe_pictures boolean NOT NULL DEFAULT false;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS weekly_email_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.topics.family_safe IS 'Owner choice: filter adult, violent and gambling stories out before they are written.';
COMMENT ON COLUMN public.topics.brand_safe_pictures IS 'Brand/character/fandom feed: never auto-draw pictures; use the source image, and keep any drawn picture abstract with no characters or logos.';
COMMENT ON COLUMN public.topics.weekly_email_enabled IS 'Owner switch for the weekly roundup email (only sent when email sign-ups are on).';

-- New feeds start with every in-feed extra off. Existing rows are untouched.
ALTER TABLE public.topic_insight_settings ALTER COLUMN story_momentum_enabled SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_default_insight_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO topic_insight_settings (topic_id, story_momentum_enabled, social_proof_enabled, this_time_last_month_enabled)
  VALUES (NEW.id, FALSE, FALSE, FALSE)
  ON CONFLICT (topic_id) DO NOTHING;
  RETURN NEW;
END;
$function$;