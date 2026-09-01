DROP INDEX IF EXISTS public.events_topic_source_external_idx;
ALTER TABLE public.events
  ADD CONSTRAINT events_topic_source_external_key UNIQUE (topic_id, source_api, external_id);