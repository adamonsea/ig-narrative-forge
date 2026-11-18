-- Shared ownership check: owner, admin/superadmin, service role, or internal (no request JWT, e.g. cron)
CREATE OR REPLACE FUNCTION public.can_manage_topic(p_topic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.role()) IS NULL
      OR (SELECT auth.role()) = 'service_role'
      OR ((SELECT auth.uid()) IS NOT NULL AND (
           public.has_role((SELECT auth.uid()), 'admin')
        OR public.has_role((SELECT auth.uid()), 'superadmin')
        OR EXISTS (SELECT 1 FROM public.topics t WHERE t.id = p_topic_id AND t.created_by = (SELECT auth.uid()))
      ))
$$;

CREATE OR REPLACE FUNCTION public.is_internal_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.role()) IS NULL
      OR (SELECT auth.role()) = 'service_role'
      OR ((SELECT auth.uid()) IS NOT NULL AND (
           public.has_role((SELECT auth.uid()), 'admin')
        OR public.has_role((SELECT auth.uid()), 'superadmin')))
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_topic(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_internal_or_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_topic(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_or_admin() TO service_role;

-- Move originals behind guarded wrappers
ALTER FUNCTION public.add_source_to_topic(uuid, uuid, jsonb) RENAME TO _impl_add_source_to_topic;
ALTER FUNCTION public.remove_source_from_topic(uuid, uuid) RENAME TO _impl_remove_source_from_topic;
ALTER FUNCTION public.delete_story_cascade(uuid) RENAME TO _impl_delete_story_cascade;
ALTER FUNCTION public.approve_article_for_generation(uuid) RENAME TO _impl_approve_article_for_generation;
ALTER FUNCTION public.get_admin_topic_stories(uuid, text, integer, integer) RENAME TO _impl_get_admin_topic_stories;
ALTER FUNCTION public.get_topic_articles_multi_tenant(uuid, text, integer, integer) RENAME TO _impl_get_topic_articles_multi_tenant;
ALTER FUNCTION public.rescore_articles_for_topic(uuid) RENAME TO _impl_rescore_articles_for_topic;
ALTER FUNCTION public.migrate_articles_to_multi_tenant(integer) RENAME TO _impl_migrate_articles_to_multi_tenant;
ALTER FUNCTION public.get_stories_unified(uuid) RENAME TO _impl_get_stories_unified;
ALTER FUNCTION public.get_stories_unified(uuid, text, integer, integer) RENAME TO _impl_get_stories_unified;

REVOKE EXECUTE ON FUNCTION public._impl_add_source_to_topic(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_remove_source_from_topic(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_delete_story_cascade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_approve_article_for_generation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_get_admin_topic_stories(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_get_topic_articles_multi_tenant(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_rescore_articles_for_topic(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_migrate_articles_to_multi_tenant(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_get_stories_unified(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._impl_get_stories_unified(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;

-- Write wrappers
CREATE FUNCTION public.add_source_to_topic(p_topic_id uuid, p_source_id uuid, p_source_config jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._impl_add_source_to_topic(p_topic_id, p_source_id, p_source_config);
END;
$$;

CREATE FUNCTION public.remove_source_from_topic(p_topic_id uuid, p_source_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._impl_remove_source_from_topic(p_topic_id, p_source_id);
END;
$$;

CREATE FUNCTION public.delete_story_cascade(p_story_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_topic_id uuid;
BEGIN
  SELECT COALESCE(a.topic_id, ta.topic_id) INTO v_topic_id
  FROM public.stories s
  LEFT JOIN public.articles a ON a.id = s.article_id
  LEFT JOIN public.topic_articles ta ON ta.id = s.topic_article_id
  WHERE s.id = p_story_id;

  IF NOT public.is_internal_or_admin() AND (v_topic_id IS NULL OR NOT public.can_manage_topic(v_topic_id)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._impl_delete_story_cascade(p_story_id);
END;
$$;

CREATE FUNCTION public.approve_article_for_generation(article_uuid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_topic_id uuid;
BEGIN
  SELECT a.topic_id INTO v_topic_id FROM public.articles a WHERE a.id = article_uuid;
  IF NOT public.is_internal_or_admin() AND (v_topic_id IS NULL OR NOT public.can_manage_topic(v_topic_id)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._impl_approve_article_for_generation(article_uuid);
END;
$$;

CREATE FUNCTION public.rescore_articles_for_topic(p_topic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM public._impl_rescore_articles_for_topic(p_topic_id);
END;
$$;

CREATE FUNCTION public.migrate_articles_to_multi_tenant(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_internal_or_admin() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._impl_migrate_articles_to_multi_tenant(p_limit);
END;
$$;

-- Read wrappers: return nothing unless the caller manages the feed
CREATE FUNCTION public.get_admin_topic_stories(p_topic_id uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, title text, status text, is_published boolean, created_at timestamp with time zone, updated_at timestamp with time zone, article_id uuid, topic_article_id uuid, shared_content_id uuid, article_title text, article_url text, article_author text, article_published_at timestamp with time zone, slide_count bigint, story_type text, cover_illustration_url text, cover_illustration_prompt text, illustration_generated_at timestamp with time zone, animated_illustration_url text, slide_type text, tone text, writing_style text, audience_expertise text, scheduled_publish_at timestamp with time zone, animation_suggestions text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public._impl_get_admin_topic_stories(p_topic_id, p_status, p_limit, p_offset);
END;
$$;

CREATE FUNCTION public.get_topic_articles_multi_tenant(p_topic_id uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, shared_content_id uuid, topic_id uuid, source_id uuid, regional_relevance_score integer, content_quality_score integer, import_metadata jsonb, originality_confidence integer, created_at timestamp with time zone, updated_at timestamp with time zone, processing_status text, keyword_matches text[], url text, normalized_url text, title text, body text, author text, image_url text, canonical_url text, content_checksum text, published_at timestamp with time zone, word_count integer, language text, source_domain text, last_seen_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public._impl_get_topic_articles_multi_tenant(p_topic_id, p_status, p_limit, p_offset);
END;
$$;

-- Public archive fallback: strangers only see published stories
CREATE FUNCTION public.get_stories_unified(p_topic_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, article_id uuid, topic_article_id uuid, shared_content_id uuid, title text, status text, is_published boolean, created_at timestamp with time zone, updated_at timestamp with time zone, slides_count integer, source_type text, slides jsonb, source_url text, author text, word_count integer, cover_illustration_url text, cover_illustration_prompt text, illustration_generated_at timestamp with time zone, slidetype text, tone text, writing_style text, audience_expertise text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manage boolean := CASE WHEN p_topic_id IS NULL THEN public.is_internal_or_admin() ELSE public.can_manage_topic(p_topic_id) END;
BEGIN
  RETURN QUERY
  SELECT r.* FROM public._impl_get_stories_unified(p_topic_id) r
  WHERE v_manage OR (r.is_published = true AND r.status IN ('ready', 'published'));
END;
$$;

CREATE FUNCTION public.get_stories_unified(p_topic_id uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, article_id uuid, topic_article_id uuid, shared_content_id uuid, title text, status text, publication_name text, author text, is_published boolean, quality_score integer, cover_illustration_url text, cover_illustration_prompt text, created_at timestamp with time zone, updated_at timestamp with time zone, slides jsonb, source_url text, word_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manage boolean := public.can_manage_topic(p_topic_id);
BEGIN
  RETURN QUERY
  SELECT r.* FROM public._impl_get_stories_unified(p_topic_id, p_status, p_limit, p_offset) r
  WHERE v_manage OR (r.is_published = true AND r.status IN ('ready', 'published'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_source_to_topic(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_source_from_topic(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_story_cascade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_article_for_generation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rescore_articles_for_topic(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.migrate_articles_to_multi_tenant(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_topic_stories(uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_topic_articles_multi_tenant(uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stories_unified(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stories_unified(uuid, text, integer, integer) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.add_source_to_topic(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_source_from_topic(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_story_cascade(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_article_for_generation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rescore_articles_for_topic(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.migrate_articles_to_multi_tenant(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_topic_stories(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_topic_articles_multi_tenant(uuid, text, integer, integer) FROM PUBLIC, anon;

-- System-only: whole-feed delete, raw article text and background/maintenance jobs
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.delete_topic_cascade(uuid)',
    'public.get_article_content_unified(uuid, uuid, uuid)',
    'public.auto_generate_missing_schedules()',
    'public.create_story_from_multi_tenant(uuid, uuid, text, text)',
    'public.detect_article_duplicates(uuid)',
    'public.detect_article_duplicates(uuid, uuid)',
    'public.find_duplicate_articles(uuid, numeric)',
    'public.get_legacy_articles_awaiting_simplification(uuid)',
    'public.get_multitenant_articles_awaiting_simplification(uuid)',
    'public.get_queue_items_unified(uuid)',
    'public.log_error_ticket(text, jsonb, text, text, text, jsonb, text)',
    'public.populate_topic_sources_from_existing()',
    'public.queue_multi_tenant_article(uuid, text, text, tone_type, text)',
    'public.queue_multi_tenant_article(uuid, uuid, text, tone_type, text, text)',
    'public.reset_stalled_processing()',
    'public.reset_stalled_stories()',
    'public.snapshot_sentiment_keywords()',
    'public.test_rss_import(text)',
    'public.test_search_functionality(text)',
    'public.update_cron_schedules()',
    'public.update_source_health_metrics(uuid, boolean, integer, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;