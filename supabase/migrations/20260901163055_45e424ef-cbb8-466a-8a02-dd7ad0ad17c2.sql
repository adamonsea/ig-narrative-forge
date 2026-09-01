ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS events_topic_source_external_idx
  ON public.events (topic_id, source_api, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS event_source_url text;