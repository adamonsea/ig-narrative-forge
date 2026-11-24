
CREATE OR REPLACE FUNCTION public.get_feed_editorial_profile(p_topic_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  SELECT to_jsonb(p) INTO r FROM public.feed_editorial_profiles p WHERE p.topic_id = p_topic_id;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.save_feed_editorial_profile(p_topic_id uuid, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.feed_editorial_profiles (topic_id) VALUES (p_topic_id) ON CONFLICT (topic_id) DO NOTHING;
  UPDATE public.feed_editorial_profiles SET
    enabled = CASE WHEN p_values ? 'enabled' THEN (p_values->>'enabled')::boolean ELSE enabled END,
    languages = CASE WHEN p_values ? 'languages' THEN ARRAY(SELECT jsonb_array_elements_text(p_values->'languages')) ELSE languages END,
    caption_templates = CASE WHEN p_values ? 'caption_templates' THEN p_values->'caption_templates' ELSE caption_templates END,
    fixed_hashtags = CASE WHEN p_values ? 'fixed_hashtags' THEN ARRAY(SELECT jsonb_array_elements_text(p_values->'fixed_hashtags')) ELSE fixed_hashtags END,
    event_hashtag_min = CASE WHEN p_values ? 'event_hashtag_min' THEN (p_values->>'event_hashtag_min')::int ELSE event_hashtag_min END,
    event_hashtag_max = CASE WHEN p_values ? 'event_hashtag_max' THEN (p_values->>'event_hashtag_max')::int ELSE event_hashtag_max END,
    genres = CASE WHEN p_values ? 'genres' THEN p_values->'genres' ELSE genres END,
    flags = CASE WHEN p_values ? 'flags' THEN ARRAY(SELECT jsonb_array_elements_text(p_values->'flags')) ELSE flags END,
    flag_rules = CASE WHEN p_values ? 'flag_rules' THEN p_values->'flag_rules' ELSE flag_rules END,
    labels = CASE WHEN p_values ? 'labels' THEN p_values->'labels' ELSE labels END,
    voice_rules = CASE WHEN p_values ? 'voice_rules' THEN ARRAY(SELECT jsonb_array_elements_text(p_values->'voice_rules')) ELSE voice_rules END,
    auto_copy_days = CASE WHEN p_values ? 'auto_copy_days' THEN LEAST(365, GREATEST(0, (p_values->>'auto_copy_days')::int)) ELSE auto_copy_days END,
    updated_at = now()
  WHERE topic_id = p_topic_id
  RETURNING to_jsonb(feed_editorial_profiles.*) INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.get_event_editorial(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid;
BEGIN
  SELECT topic_id INTO t FROM public.events WHERE id = p_event_id;
  IF t IS NULL OR NOT public.can_manage_topic(t) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'copy', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'language', language, 'text', text, 'edited_at', edited_at)) FROM public.event_copy WHERE event_id = p_event_id), '[]'::jsonb),
    'caps', COALESCE((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'text', text, 'edited_at', edited_at)) FROM public.event_captions WHERE event_id = p_event_id), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.save_event_editorial(p_event_id uuid, p_kind text, p_key text, p_language text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid; u uuid := auth.uid();
BEGIN
  SELECT topic_id INTO t FROM public.events WHERE id = p_event_id;
  IF t IS NULL OR NOT public.can_manage_topic(t) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF p_kind = 'caption' THEN
    INSERT INTO public.event_captions (event_id, platform, language, text, edited_at, edited_by)
    VALUES (p_event_id, p_key, COALESCE(p_language, ''), p_value #>> '{}', now(), u)
    ON CONFLICT (event_id, platform, language) DO UPDATE SET text = EXCLUDED.text, edited_at = now(), edited_by = u, updated_at = now();
  ELSIF p_kind = 'copy' THEN
    INSERT INTO public.event_copy (event_id, kind, language, text, edited_at, edited_by)
    VALUES (p_event_id, p_key, COALESCE(p_language, ''), p_value #>> '{}', now(), u)
    ON CONFLICT (event_id, language, kind) DO UPDATE SET text = EXCLUDED.text, edited_at = now(), edited_by = u, updated_at = now();
  ELSIF p_kind = 'field' AND p_key IN ('genre', 'flags') THEN
    IF p_key = 'genre' THEN UPDATE public.events SET genre = p_value #>> '{}' WHERE id = p_event_id;
    ELSE UPDATE public.events SET flags = ARRAY(SELECT jsonb_array_elements_text(p_value)) WHERE id = p_event_id; END IF;
    INSERT INTO public.event_field_edits (event_id, field, edited_at, edited_by) VALUES (p_event_id, p_key, now(), u)
    ON CONFLICT (event_id, field) DO UPDATE SET edited_at = now(), edited_by = u;
  ELSE
    RAISE EXCEPTION 'unknown field';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_feed_editorial_profile(uuid), public.save_feed_editorial_profile(uuid, jsonb), public.get_event_editorial(uuid), public.save_event_editorial(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feed_editorial_profile(uuid), public.save_feed_editorial_profile(uuid, jsonb), public.get_event_editorial(uuid), public.save_event_editorial(uuid, text, text, text, jsonb) TO authenticated, service_role;
