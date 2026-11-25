-- Shared reader-visible event set (one definition for the feed and the Feed API)
CREATE OR REPLACE FUNCTION public.topic_reader_events(p_topic_id uuid)
RETURNS TABLE(id uuid, start_date date, start_time time, title text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH now_l AS (SELECT (now() AT TIME ZONE 'Europe/London') AS ts),
  today AS (SELECT ts::date AS d, ts::time AS t FROM now_l)
  SELECT DISTINCT ON (lower(btrim(e.title))) e.id, e.start_date, e.start_time, e.title
  FROM events e, today
  WHERE e.topic_id = p_topic_id
    AND e.status = 'published'
    AND e.start_date >= today.d
    AND e.start_date <= today.d + 120
    AND NOT (e.start_date = today.d AND ((e.start_time IS NOT NULL AND e.start_time < today.t) OR (e.start_time IS NULL AND today.t >= time '18:00')))
  ORDER BY lower(btrim(e.title)), e.start_date, e.start_time NULLS LAST, (e.location IS NULL), e.created_at
$$;
GRANT EXECUTE ON FUNCTION public.topic_reader_events(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_topic_events_feed(p_topic_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, title text, start_date date, start_time time without time zone, location text, source_url text, source_name text, event_type text, price text, is_free boolean, description text, image_path text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH photos AS (SELECT coalesce((SELECT t.event_photos_enabled FROM topics t WHERE t.id = p_topic_id), false) AS on_)
  SELECT e.id, e.title, e.start_date, e.start_time, e.location, e.source_url, e.source_name, e.event_type, e.price, e.is_free, e.description,
    CASE WHEN photos.on_ AND NOT e.image_hidden THEN e.image_path END
  FROM topic_reader_events(p_topic_id) r JOIN events e ON e.id = r.id, photos
  ORDER BY e.start_date, e.start_time NULLS LAST, e.title, e.id
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

-- Feed API tokens (hash only; one active token per feed)
CREATE TABLE public.feed_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  rl_window_start timestamptz NOT NULL DEFAULT now(),
  rl_count integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.feed_api_tokens TO service_role;
ALTER TABLE public.feed_api_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX feed_api_tokens_topic ON public.feed_api_tokens(topic_id) WHERE revoked_at IS NULL;

ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS api_include_photos boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_feed_api_status(p_topic_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  SELECT token_prefix, created_at, last_used_at INTO r FROM feed_api_tokens WHERE topic_id = p_topic_id AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('has_token', r.token_prefix IS NOT NULL, 'prefix', r.token_prefix, 'created_at', r.created_at, 'last_used_at', r.last_used_at,
    'include_photos', (SELECT api_include_photos FROM topics WHERE id = p_topic_id));
END $$;

CREATE OR REPLACE FUNCTION public.create_feed_api_token(p_topic_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE tok text;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE feed_api_tokens SET revoked_at = now() WHERE topic_id = p_topic_id AND revoked_at IS NULL;
  tok := 'cfa_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO feed_api_tokens(topic_id, token_hash, token_prefix, created_by)
  VALUES (p_topic_id, encode(digest(tok, 'sha256'), 'hex'), left(tok, 10), auth.uid());
  RETURN tok;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_feed_api_token(p_topic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE feed_api_tokens SET revoked_at = now() WHERE topic_id = p_topic_id AND revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_feed_api_photos(p_topic_id uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE topics SET api_include_photos = coalesce(p_on, false) WHERE id = p_topic_id;
END $$;

-- Service only: check a token hash, count the call (60 per minute), return its feed
CREATE OR REPLACE FUNCTION public.feed_api_use_token(p_hash text, p_per_minute integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  UPDATE feed_api_tokens SET
    rl_count = CASE WHEN rl_window_start < now() - interval '1 minute' THEN 1 ELSE rl_count + 1 END,
    rl_window_start = CASE WHEN rl_window_start < now() - interval '1 minute' THEN now() ELSE rl_window_start END,
    last_used_at = now()
  WHERE token_hash = p_hash AND revoked_at IS NULL
  RETURNING topic_id, rl_count INTO r;
  IF r.topic_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('topic_id', r.topic_id, 'limited', r.rl_count > p_per_minute);
END $$;

REVOKE EXECUTE ON FUNCTION public.get_feed_api_status(uuid), public.create_feed_api_token(uuid), public.revoke_feed_api_token(uuid), public.set_feed_api_photos(uuid, boolean), public.feed_api_use_token(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feed_api_status(uuid), public.create_feed_api_token(uuid), public.revoke_feed_api_token(uuid), public.set_feed_api_photos(uuid, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.feed_api_use_token(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.feed_api_use_token(text, integer) TO service_role;