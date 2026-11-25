CREATE TABLE public.topic_slug_history (
  old_slug text PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topic_slug_history_topic_idx ON public.topic_slug_history(topic_id);
GRANT ALL ON public.topic_slug_history TO service_role;
ALTER TABLE public.topic_slug_history ENABLE ROW LEVEL SECURITY;

-- Old handle -> current handle; null when the slug is live or unknown. Public, reveals only public slugs.
CREATE OR REPLACE FUNCTION public.resolve_feed_slug(p_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.slug FROM public.topic_slug_history h
  JOIN public.topics t ON t.id = h.topic_id
  WHERE h.old_slug = lower(p_slug)
    AND NOT EXISTS (SELECT 1 FROM public.topics x WHERE x.slug = lower(p_slug))
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_feed_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_feed_slug(text) TO anon, authenticated, service_role;

-- 'ok' | 'invalid' | 'taken' for a proposed handle for this feed.
CREATE OR REPLACE FUNCTION public.check_feed_handle(p_topic_id uuid, p_slug text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s text := lower(trim(p_slug));
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF s !~ '^[a-z0-9-]{3,30}$' OR s IN ('topic','new','admin','api','feed','widget') THEN RETURN 'invalid'; END IF;
  IF EXISTS (SELECT 1 FROM public.topics WHERE slug = s AND id <> p_topic_id)
     OR EXISTS (SELECT 1 FROM public.topic_slug_history WHERE old_slug = s AND topic_id <> p_topic_id) THEN
    RETURN 'taken';
  END IF;
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION public.check_feed_handle(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_feed_handle(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_feed_handle(p_topic_id uuid, p_slug text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text := lower(trim(p_slug)); old text; verdict text;
BEGIN
  verdict := public.check_feed_handle(p_topic_id, s);
  IF verdict <> 'ok' THEN RETURN verdict; END IF;
  SELECT slug INTO old FROM public.topics WHERE id = p_topic_id;
  IF old = s THEN RETURN 'ok'; END IF;
  DELETE FROM public.topic_slug_history WHERE old_slug = s AND topic_id = p_topic_id;
  INSERT INTO public.topic_slug_history (old_slug, topic_id) VALUES (old, p_topic_id)
    ON CONFLICT (old_slug) DO UPDATE SET topic_id = EXCLUDED.topic_id;
  UPDATE public.topics SET slug = s, updated_at = now() WHERE id = p_topic_id;
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION public.set_feed_handle(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_feed_handle(uuid, text) TO authenticated, service_role;