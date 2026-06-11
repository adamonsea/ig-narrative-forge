DO $$
DECLARE
  fn record;
  keep text[] := ARRAY[
    -- RLS / access-check helpers (must stay callable by anon for policies)
    'has_role','user_has_topic_access','user_has_region_access','article_is_public',
    'is_story_published','get_current_user_role','is_feature_enabled',
    -- Public read functions (public feed / story / sitemap / discover / widget pages)
    'get_public_topic_feed','get_public_story_by_slug_and_id','get_public_slides_for_stories',
    'get_published_stories_for_sitemap','get_safe_public_topic_info','get_popular_stories_by_period',
    'get_topic_id_by_slug','get_stories_unified','get_topic_stories','get_topic_stories_with_keywords',
    'get_topic_events','get_topic_sources','get_topic_filter_options','get_source_topics',
    'get_swipe_mode_stories','get_article_content_unified','get_topic_quiz_stats',
    'get_subscriber_leaderboard','get_subscriber_score','get_swipe_insights',
    'get_story_reaction_counts','get_story_reaction_counts_batch','get_story_swipe_stats',
    -- Public write functions (interactions / analytics / newsletter signup)
    'upsert_story_reaction','record_story_interaction','record_feed_visit','log_event',
    'log_drip_feed_event','check_newsletter_signup_rate_limit','record_newsletter_signup_attempt',
    'upsert_subscriber_score','normalize_url','normalize_url_enhanced','increment_short_link_clicks'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT (p.proname = ANY(keep))
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC;',
                   fn.proname, pg_get_function_identity_arguments(fn.oid));
  END LOOP;
END $$;