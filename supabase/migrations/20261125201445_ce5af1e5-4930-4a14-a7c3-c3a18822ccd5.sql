CREATE OR REPLACE FUNCTION public.approve_topic_article(
  p_topic_article_id uuid, p_slide_type text, p_tone text, p_writing_style text, p_result_data jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ta record; sc record; v_article uuid; v_queue uuid; v_active uuid;
BEGIN
  SELECT * INTO ta FROM topic_articles WHERE id = p_topic_article_id;
  IF ta IS NULL THEN RAISE EXCEPTION 'Story not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.can_manage_topic(ta.topic_id) OR (SELECT auth.uid()) IS NULL AND (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_active FROM content_generation_queue
   WHERE shared_content_id = ta.shared_content_id AND status IN ('pending','processing')
   ORDER BY created_at DESC LIMIT 1;
  IF v_active IS NOT NULL THEN RETURN jsonb_build_object('queue_id', v_active, 'already_queued', true); END IF;

  UPDATE topic_articles SET processing_status = 'processed', updated_at = now() WHERE id = ta.id;
  SELECT * INTO sc FROM shared_article_content WHERE id = ta.shared_content_id;

  SELECT id INTO v_article FROM articles WHERE source_url = sc.url ORDER BY (topic_id = ta.topic_id) DESC NULLS LAST, created_at LIMIT 1;
  IF v_article IS NULL THEN
    INSERT INTO articles (title, body, source_url, canonical_url, author, published_at, processing_status,
      content_quality_score, regional_relevance_score, word_count, topic_id, import_metadata)
    VALUES (sc.title, coalesce(sc.body, 'Multi-tenant bridge article'), sc.url, sc.url, sc.author, sc.published_at, 'processed',
      ta.content_quality_score, ta.regional_relevance_score, sc.word_count, ta.topic_id,
      jsonb_build_object('multi_tenant_bridge', true, 'topic_article_id', ta.id, 'shared_content_id', ta.shared_content_id, 'created_for_queue', true))
    ON CONFLICT (source_url) DO NOTHING
    RETURNING id INTO v_article;
    IF v_article IS NULL THEN SELECT id INTO v_article FROM articles WHERE source_url = sc.url LIMIT 1; END IF;
  END IF;

  INSERT INTO content_generation_queue (article_id, topic_article_id, shared_content_id, slidetype, ai_provider, tone, writing_style, audience_expertise, status, result_data)
  VALUES (v_article, ta.id, ta.shared_content_id, p_slide_type, 'deepseek', p_tone::tone_type, p_writing_style, NULL, 'pending', coalesce(p_result_data, '{}'::jsonb))
  RETURNING id INTO v_queue;
  RETURN jsonb_build_object('queue_id', v_queue, 'already_queued', false);
END $$;
REVOKE ALL ON FUNCTION public.approve_topic_article(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_topic_article(uuid, text, text, text, jsonb) TO authenticated, service_role;