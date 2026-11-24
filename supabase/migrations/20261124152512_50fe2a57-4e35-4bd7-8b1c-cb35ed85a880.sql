ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticket_url text,
  ADD COLUMN IF NOT EXISTS ticket_note text,
  ADD COLUMN IF NOT EXISTS age_limit text,
  ADD COLUMN IF NOT EXISTS festival text,
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS event_hashtags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE TABLE public.feed_editorial_profiles (
  topic_id uuid PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  languages text[] NOT NULL DEFAULT '{en}',
  caption_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  fixed_hashtags text[] NOT NULL DEFAULT '{}',
  event_hashtag_min integer NOT NULL DEFAULT 2,
  event_hashtag_max integer NOT NULL DEFAULT 4,
  genres jsonb NOT NULL DEFAULT '[]'::jsonb,
  flags text[] NOT NULL DEFAULT '{}',
  voice_rules text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_editorial_profiles TO authenticated;
GRANT ALL ON public.feed_editorial_profiles TO service_role;
ALTER TABLE public.feed_editorial_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage editorial profile" ON public.feed_editorial_profiles FOR ALL TO authenticated
  USING (public.can_manage_topic(topic_id)) WITH CHECK (public.can_manage_topic(topic_id));

CREATE TABLE public.event_copy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  language text NOT NULL,
  kind text NOT NULL,
  text text NOT NULL DEFAULT '',
  source_hash text,
  generated_at timestamptz,
  edited_at timestamptz,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, language, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_copy TO authenticated;
GRANT ALL ON public.event_copy TO service_role;
ALTER TABLE public.event_copy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage event copy" ON public.event_copy FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.can_manage_topic(e.topic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.can_manage_topic(e.topic_id)));

CREATE TABLE public.event_captions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  platform text NOT NULL,
  language text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  source_hash text,
  edited_at timestamptz,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, platform, language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_captions TO authenticated;
GRANT ALL ON public.event_captions TO service_role;
ALTER TABLE public.event_captions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage event captions" ON public.event_captions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.can_manage_topic(e.topic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.can_manage_topic(e.topic_id)));

CREATE TABLE public.event_field_edits (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  field text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  edited_by uuid,
  PRIMARY KEY (event_id, field)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_field_edits TO authenticated;
GRANT ALL ON public.event_field_edits TO service_role;
ALTER TABLE public.event_field_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage event field edits" ON public.event_field_edits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.can_manage_topic(e.topic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.can_manage_topic(e.topic_id)));

INSERT INTO public.event_field_edits (event_id, field, edited_at)
  SELECT id, 'description', updated_at FROM public.events WHERE description_edited
  UNION ALL SELECT id, 'image', updated_at FROM public.events WHERE image_edited
  UNION ALL SELECT id, 'category', updated_at FROM public.events WHERE category_locked
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER t_fep_updated BEFORE UPDATE ON public.feed_editorial_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
CREATE TRIGGER t_ec_updated BEFORE UPDATE ON public.event_copy FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
CREATE TRIGGER t_ecap_updated BEFORE UPDATE ON public.event_captions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();