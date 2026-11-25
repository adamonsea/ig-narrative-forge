CREATE OR REPLACE FUNCTION public.feed_api_events(p_token_hash text, p_feed text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tok jsonb; t record; lim int := least(greatest(coalesce(p_limit, 20), 1), 100); off int := greatest(coalesce(p_offset, 0), 0); rows jsonb; total int;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN RETURN jsonb_build_object('error', 'invalid_token'); END IF;
  tok := public.feed_api_use_token(p_token_hash, 60);
  IF tok IS NULL THEN RETURN jsonb_build_object('error', 'invalid_token'); END IF;
  IF (tok->>'limited')::boolean THEN RETURN jsonb_build_object('error', 'rate_limited'); END IF;
  SELECT id, name, slug, api_include_photos INTO t FROM topics
   WHERE slug = coalesce(public.resolve_feed_slug(lower(p_feed)), lower(p_feed)) AND is_active AND is_public;
  IF t.id IS NULL THEN RETURN jsonb_build_object('error', 'feed_not_found'); END IF;
  IF t.id <> (tok->>'topic_id')::uuid THEN RETURN jsonb_build_object('error', 'wrong_feed'); END IF;

  WITH visible AS (
    SELECT e.* FROM topic_reader_events(t.id) r JOIN events e ON e.id = r.id
    WHERE (p_from IS NULL OR e.start_date >= p_from) AND (p_to IS NULL OR e.start_date <= p_to)
      AND (p_category IS NULL OR lower(e.category) = lower(p_category) OR lower(e.event_type) = lower(p_category))
  ), counted AS (SELECT count(*)::int n FROM visible),
  page AS (SELECT * FROM visible ORDER BY start_date, start_time NULLS LAST, title, id LIMIT lim OFFSET off)
  SELECT (SELECT n FROM counted), coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'description', p.description, 'start_date', p.start_date, 'start_time', p.start_time,
    'run_start', p.run_start, 'end_date', p.end_date, 'location', p.location, 'category', coalesce(p.category, p.event_type),
    'price', p.price, 'is_free', p.is_free, 'source_name', p.source_name, 'source_url', p.source_url,
    'image_path', CASE WHEN t.api_include_photos AND NOT coalesce(p.image_hidden, false) THEN p.image_path END,
    'image_source_url', CASE WHEN t.api_include_photos AND NOT coalesce(p.image_hidden, false) AND p.image_path IS NOT NULL THEN p.image_source_url END
  ) ORDER BY p.start_date, p.start_time NULLS LAST, p.title, p.id), '[]'::jsonb)
  INTO total, rows FROM page p;

  RETURN jsonb_build_object('feed', jsonb_build_object('name', t.name, 'handle', t.slug), 'events', rows, 'total', coalesce(total, 0), 'offset', off, 'limit', lim);
END $$;
REVOKE EXECUTE ON FUNCTION public.feed_api_events(text, text, integer, integer, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feed_api_events(text, text, integer, integer, date, date, text) TO anon, authenticated, service_role;