CREATE TABLE public.mcp_studio_grants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_name text,
  version int NOT NULL DEFAULT 1,
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
GRANT SELECT, DELETE ON public.mcp_studio_grants TO authenticated;
GRANT ALL ON public.mcp_studio_grants TO service_role;
ALTER TABLE public.mcp_studio_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own grants" ON public.mcp_studio_grants FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "Owners remove own grants" ON public.mcp_studio_grants FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.mcp_studio_record_grant(p_client_id text, p_client_name text, p_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(p_client_id,'') = '' THEN RAISE EXCEPTION 'not signed in'; END IF;
  INSERT INTO mcp_studio_grants(user_id, client_id, client_name, version)
  VALUES (auth.uid(), left(p_client_id,200), left(p_client_name,200), greatest(1, least(coalesce(p_version,1), 100)))
  ON CONFLICT (user_id, client_id) DO UPDATE SET client_name = excluded.client_name, version = excluded.version, approved_at = now();
END $$;

-- Rate limit (60/min) + usage log. Returns false when over the limit.
CREATE OR REPLACE FUNCTION public.mcp_studio_call(p_tool text, p_client_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO v_n FROM usage_events
   WHERE payer_id = v_uid AND actor = 'mcp_studio' AND created_at > now() - interval '1 minute';
  INSERT INTO usage_events(payer_id, actor, kind, credits, stories, shadow, outcome, ref_id)
  VALUES (v_uid, 'mcp_studio', left(coalesce(p_tool,'unknown'),60), 0, 0, true,
          CASE WHEN v_n >= 60 THEN 'rate_limited' ELSE 'ok' END, left(p_client_id,200));
  RETURN v_n < 60;
END $$;

CREATE OR REPLACE FUNCTION public.mcp_studio_account()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  RETURN billing_owner_status(auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.mcp_studio_feeds()
RETURNS TABLE(id uuid, name text, slug text, owner_pro boolean, autopilot boolean, sources_count bigint, stories_this_week bigint, last_story_at timestamptz, health text, health_reason text, owner_action text, broken_sources int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id, t.name, t.slug, has_pro_access(t.created_by),
    coalesce(tas.automation_mode = 'holiday' AND tas.auto_simplify_enabled, false),
    (SELECT count(*) FROM topic_sources ts WHERE ts.topic_id = t.id AND ts.is_active),
    (SELECT count(DISTINCT s.id) FROM stories s LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id LEFT JOIN articles a ON a.id = s.article_id
      WHERE coalesce(ta.topic_id, a.topic_id) = t.id AND s.is_published AND s.created_at >= now() - interval '7 days'),
    (SELECT max(coalesce(s.published_at, s.created_at)) FROM stories s LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id LEFT JOIN articles a ON a.id = s.article_id
      WHERE coalesce(ta.topic_id, a.topic_id) = t.id AND s.is_published),
    fh.status, fh.reason, fh.owner_action, fh.broken_sources
  FROM topics t
  LEFT JOIN topic_automation_settings tas ON tas.topic_id = t.id
  LEFT JOIN feed_health fh ON fh.topic_id = t.id
  WHERE coalesce(t.is_archived, false) = false AND can_manage_topic(t.id)
  ORDER BY t.name;
END $$;

REVOKE ALL ON FUNCTION public.mcp_studio_record_grant(text,text,int), public.mcp_studio_call(text,text), public.mcp_studio_account(), public.mcp_studio_feeds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_studio_record_grant(text,text,int), public.mcp_studio_call(text,text), public.mcp_studio_account(), public.mcp_studio_feeds() TO authenticated, service_role;