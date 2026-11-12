-- 1. Every events source gets a kind; readers are chosen by kind.
ALTER TABLE public.event_sources
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'whats_on_page';

ALTER TABLE public.event_sources
  ADD CONSTRAINT event_sources_kind_check CHECK (kind IN ('whats_on_page', 'calendar_feed'));

-- 2. Events remember which source brought them in (for counts, refresh and removal).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_source_id uuid REFERENCES public.event_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_event_source_id ON public.events(event_source_id) WHERE event_source_id IS NOT NULL;

-- 3. Copy each feed's calendar address into the sources list (topics.event_source_url is left untouched).
INSERT INTO public.event_sources (topic_id, url, name, kind, method, is_active, created_by)
SELECT t.id,
       t.event_source_url,
       'Calendar feed (' || regexp_replace(split_part(split_part(t.event_source_url, '://', 2), '/', 1), '^(www|members)\.', '') || ')',
       'calendar_feed',
       'calendar_feed',
       true,
       t.created_by
FROM public.topics t
WHERE t.event_source_url IS NOT NULL AND btrim(t.event_source_url) <> ''
ON CONFLICT (topic_id, url) DO NOTHING;

-- 4. Link existing events to their source.
UPDATE public.events e
SET event_source_id = es.id
FROM public.event_sources es
WHERE e.event_source_id IS NULL
  AND e.source_api = 'whats_on'
  AND es.kind = 'whats_on_page'
  AND es.topic_id = e.topic_id
  AND split_part(e.external_id, ':', 1) = es.id::text;

UPDATE public.events e
SET event_source_id = es.id
FROM public.event_sources es
JOIN public.topics t ON t.id = es.topic_id AND t.event_source_url = es.url
WHERE e.event_source_id IS NULL
  AND e.source_api = 'chamber_feed'
  AND es.kind = 'calendar_feed'
  AND e.topic_id = es.topic_id;