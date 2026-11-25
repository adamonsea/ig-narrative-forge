CREATE OR REPLACE FUNCTION public.billing_enforced() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT enabled FROM public.feature_flags WHERE flag_name = 'billing_enforce' LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION public.billing_enforced() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_enforced() TO authenticated, service_role;

ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS daily_credit_cap integer;

CREATE TABLE public.usage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period text NOT NULL,
  metric text NOT NULL,
  threshold integer NOT NULL,
  emailed_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period, metric, threshold)
);
GRANT SELECT, UPDATE ON public.usage_alerts TO authenticated;
GRANT ALL ON public.usage_alerts TO service_role;
ALTER TABLE public.usage_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own usage alerts" ON public.usage_alerts FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "Owners mark own usage alerts seen" ON public.usage_alerts FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Published stories for an owner's feeds since a moment.
CREATE OR REPLACE FUNCTION public._owner_published_stories(p_user uuid, p_since timestamptz)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT s.id) FROM public.stories s
  LEFT JOIN public.topic_articles ta ON ta.id = s.topic_article_id
  LEFT JOIN public.articles a ON a.id = s.article_id
  JOIN public.topics t ON t.id = coalesce(ta.topic_id, a.topic_id)
  WHERE t.created_by = p_user AND s.is_published = true AND s.created_at >= p_since
$$;
REVOKE ALL ON FUNCTION public._owner_published_stories(uuid, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._owner_published_stories(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_owner_status(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pro boolean := public.has_pro_access(p_user);
  v_exempt boolean; v_balance int; v_cap int; v_created timestamptz;
  v_period timestamptz := date_trunc('month', now());
  v_trial_stories bigint; v_month_stories bigint; v_month_credits bigint; v_today_credits bigint;
  v_pause_free boolean := coalesce((SELECT enabled FROM public.feature_flags WHERE flag_name='pause_free_automation' LIMIT 1), false);
BEGIN
  SELECT coalesce(billing_exempt,false), coalesce(credits_balance,0), daily_credit_cap
    INTO v_exempt, v_balance, v_cap FROM public.user_credits WHERE user_id = p_user;
  SELECT created_at INTO v_created FROM auth.users WHERE id = p_user;
  v_trial_stories := public._owner_published_stories(p_user, '-infinity');
  v_month_stories := public._owner_published_stories(p_user, v_period);
  SELECT coalesce(sum(credits),0) INTO v_month_credits FROM public.usage_events WHERE payer_id = p_user AND created_at >= v_period;
  SELECT coalesce(sum(credits),0) INTO v_today_credits FROM public.usage_events WHERE payer_id = p_user AND created_at >= date_trunc('day', now());
  RETURN jsonb_build_object(
    'is_pro', v_pro, 'exempt', coalesce(v_exempt,false), 'balance', coalesce(v_balance,0),
    'created_at', v_created,
    'trial_ends_at', v_created + interval '14 days',
    'trial_over', NOT v_pro AND (now() > v_created + interval '14 days' OR v_trial_stories >= 30),
    'trial_stories', v_trial_stories,
    'month_stories', v_month_stories, 'month_credits', v_month_credits,
    'today_credits', v_today_credits,
    'daily_cap', coalesce(v_cap, CASE WHEN v_pro THEN 100 ELSE 20 END),
    'story_limit', CASE WHEN v_pro THEN 1500 ELSE 30 END,
    'credit_limit', CASE WHEN v_pro THEN 1000 ELSE 20 END,
    'reset_at', v_period + interval '1 month',
    'pause_free', v_pause_free,
    'enforce', public.billing_enforced()
  );
END $$;
REVOKE ALL ON FUNCTION public.billing_owner_status(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_owner_status(uuid) TO service_role;

-- Why automation of a kind would pause for this owner (null = runs). kind: gather | rewrite | picture | publish
CREATE OR REPLACE FUNCTION public.automation_pause_reason(p_user uuid, p_kind text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb;
BEGIN
  IF p_user IS NULL THEN RETURN 'no_owner'; END IF;
  s := public.billing_owner_status(p_user);
  IF (s->>'exempt')::boolean THEN RETURN NULL; END IF;
  IF NOT (s->>'is_pro')::boolean AND (s->>'pause_free')::boolean THEN RETURN 'free_paused'; END IF;
  IF (s->>'trial_over')::boolean THEN RETURN 'trial_over'; END IF;
  IF p_kind IN ('gather','rewrite') AND (s->>'month_stories')::bigint >= (s->>'story_limit')::bigint THEN RETURN 'story_limit'; END IF;
  IF p_kind = 'picture' AND (s->>'balance')::int < 1 THEN RETURN 'out_of_credits'; END IF;
  IF p_kind = 'picture' AND (s->>'today_credits')::bigint >= (s->>'daily_cap')::bigint THEN RETURN 'daily_cap'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.automation_pause_reason(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_pause_reason(uuid, text) TO service_role;

-- Newly crossed 75/90/100% thresholds this month (inserted once; returned only when new).
CREATE OR REPLACE FUNCTION public.record_usage_alerts(p_user uuid)
RETURNS TABLE(metric text, threshold int) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; v_period text := to_char(now(), 'YYYY-MM'); m text; used numeric; lim numeric; t int;
BEGIN
  s := public.billing_owner_status(p_user);
  FOREACH m IN ARRAY ARRAY['stories','credits'] LOOP
    IF m = 'stories' THEN used := CASE WHEN (s->>'is_pro')::boolean THEN (s->>'month_stories')::numeric ELSE (s->>'trial_stories')::numeric END; lim := (s->>'story_limit')::numeric;
    ELSE used := (s->>'month_credits')::numeric; lim := (s->>'credit_limit')::numeric; END IF;
    FOREACH t IN ARRAY ARRAY[75,90,100] LOOP
      IF lim > 0 AND used * 100 >= lim * t THEN
        INSERT INTO public.usage_alerts(user_id, period, metric, threshold) VALUES (p_user, v_period, m, t)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN metric := m; threshold := t; RETURN NEXT; END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.record_usage_alerts(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_usage_alerts(uuid) TO service_role;

-- Signed-in owner's own usage (Settings → Usage).
CREATE OR REPLACE FUNCTION public.get_my_usage()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := (select auth.uid()); s jsonb; feeds jsonb; alerts jsonb; v_period timestamptz := date_trunc('month', now());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  s := public.billing_owner_status(uid);
  SELECT coalesce(jsonb_agg(f ORDER BY f.credits DESC, f.stories DESC), '[]'::jsonb) INTO feeds FROM (
    SELECT t.id AS topic_id, t.name,
      (SELECT count(DISTINCT st.id) FROM public.stories st
         LEFT JOIN public.topic_articles ta ON ta.id = st.topic_article_id
         LEFT JOIN public.articles a ON a.id = st.article_id
        WHERE coalesce(ta.topic_id, a.topic_id) = t.id AND st.is_published AND st.created_at >= v_period) AS stories,
      (SELECT coalesce(sum(e.credits),0) FROM public.usage_events e WHERE e.topic_id = t.id AND e.payer_id = uid AND e.created_at >= v_period) AS credits
    FROM public.topics t WHERE t.created_by = uid
  ) f;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'metric', metric, 'threshold', threshold) ORDER BY threshold DESC), '[]'::jsonb)
    INTO alerts FROM public.usage_alerts WHERE user_id = uid AND period = to_char(now(),'YYYY-MM') AND seen_at IS NULL;
  RETURN jsonb_build_object(
    'is_pro', s->'is_pro', 'exempt', s->'exempt', 'enforce', s->'enforce',
    'stories_used', CASE WHEN (s->>'is_pro')::boolean THEN s->'month_stories' ELSE s->'trial_stories' END,
    'stories_limit', s->'story_limit',
    'credits_used', s->'month_credits', 'credits_limit', s->'credit_limit',
    'balance', s->'balance', 'reset_at', CASE WHEN (s->>'is_pro')::boolean THEN s->'reset_at' ELSE s->'trial_ends_at' END,
    'feeds', feeds, 'alerts', alerts);
END $$;
REVOKE ALL ON FUNCTION public.get_my_usage() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_usage() TO authenticated;

-- Desk: is this feed paused for billing? (feed managers only)
CREATE OR REPLACE FUNCTION public.get_feed_billing_state(p_topic_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid; v_reason text;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  SELECT created_by INTO v_owner FROM public.topics WHERE id = p_topic_id;
  v_reason := coalesce(public.automation_pause_reason(v_owner, 'gather'), public.automation_pause_reason(v_owner, 'picture'));
  RETURN jsonb_build_object(
    'paused', public.billing_enforced() AND v_reason IS NOT NULL AND v_reason <> 'no_owner',
    'would_pause', v_reason,
    'is_pro', public.has_pro_access(v_owner));
END $$;
REVOKE ALL ON FUNCTION public.get_feed_billing_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_feed_billing_state(uuid) TO authenticated;

-- Admin: daily spend free vs Pro, accounts over $5 today, and the free-pause switch.
CREATE OR REPLACE FUNCTION public.get_admin_billing_overview(p_days integer DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE daily jsonb; heavy jsonb;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'superadmin') THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  WITH u AS (
    SELECT date_trunc('day', a.created_at)::date AS day, a.user_id, coalesce(a.cost_usd,0) AS usd
    FROM public.api_usage a WHERE a.created_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
  ), p AS (SELECT DISTINCT user_id, public.has_pro_access(user_id) AS pro FROM u WHERE user_id IS NOT NULL)
  SELECT coalesce(jsonb_agg(d ORDER BY d.day DESC), '[]'::jsonb) INTO daily FROM (
    SELECT u.day,
      round(sum(u.usd) FILTER (WHERE p.pro), 4) AS pro_usd,
      round(sum(u.usd) FILTER (WHERE p.pro IS NOT TRUE AND u.user_id IS NOT NULL), 4) AS free_usd,
      round(sum(u.usd) FILTER (WHERE u.user_id IS NULL), 4) AS unknown_usd
    FROM u LEFT JOIN p ON p.user_id = u.user_id GROUP BY u.day) d;
  SELECT coalesce(jsonb_agg(h ORDER BY h.usd DESC), '[]'::jsonb) INTO heavy FROM (
    SELECT a.user_id, au.email, round(sum(coalesce(a.cost_usd,0)),2) AS usd
    FROM public.api_usage a LEFT JOIN auth.users au ON au.id = a.user_id
    WHERE a.created_at >= date_trunc('day', now()) AND a.user_id IS NOT NULL
    GROUP BY a.user_id, au.email HAVING sum(coalesce(a.cost_usd,0)) > 5) h;
  RETURN jsonb_build_object('daily', daily, 'over_limit', heavy,
    'pause_free', coalesce((SELECT enabled FROM public.feature_flags WHERE flag_name='pause_free_automation' LIMIT 1), false),
    'enforce', public.billing_enforced());
END $$;
REVOKE ALL ON FUNCTION public.get_admin_billing_overview(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_billing_overview(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_pause_free_automation(p_on boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'superadmin') THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE public.feature_flags SET enabled = p_on, updated_at = now() WHERE flag_name = 'pause_free_automation';
  RETURN p_on;
END $$;
REVOKE ALL ON FUNCTION public.set_pause_free_automation(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_pause_free_automation(boolean) TO authenticated;

-- Free accounts: one feed (only once enforcement is on; exempt and Pro unaffected).
CREATE OR REPLACE FUNCTION public.enforce_free_feed_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL OR NOT public.billing_enforced() OR public.has_pro_access(NEW.created_by)
     OR coalesce((SELECT billing_exempt FROM public.user_credits WHERE user_id = NEW.created_by), false) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.topics WHERE created_by = NEW.created_by) THEN
    RAISE EXCEPTION 'free_feed_limit' USING ERRCODE = 'P0001', HINT = 'Free accounts have one feed. Upgrade to Pro for more.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_free_feed_limit ON public.topics;
CREATE TRIGGER enforce_free_feed_limit BEFORE INSERT ON public.topics FOR EACH ROW EXECUTE FUNCTION public.enforce_free_feed_limit();

-- Pro-only: API tokens and handle changes (only once enforcement is on).
CREATE OR REPLACE FUNCTION public.create_feed_api_token(p_topic_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE tok text;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF public.billing_enforced() AND NOT public.has_pro_access((SELECT created_by FROM topics WHERE id = p_topic_id)) THEN
    RAISE EXCEPTION 'pro_required' USING ERRCODE = 'P0001';
  END IF;
  UPDATE feed_api_tokens SET revoked_at = now() WHERE topic_id = p_topic_id AND revoked_at IS NULL;
  tok := 'cfa_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO feed_api_tokens(topic_id, token_hash, token_prefix, created_by)
  VALUES (p_topic_id, encode(digest(tok, 'sha256'), 'hex'), left(tok, 10), auth.uid());
  RETURN tok;
END $$;

CREATE OR REPLACE FUNCTION public.set_feed_handle(p_topic_id uuid, p_slug text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text := lower(trim(p_slug)); old text; verdict text;
BEGIN
  verdict := public.check_feed_handle(p_topic_id, s);
  IF verdict <> 'ok' THEN RETURN verdict; END IF;
  SELECT slug INTO old FROM public.topics WHERE id = p_topic_id;
  IF old = s THEN RETURN 'ok'; END IF;
  IF public.billing_enforced() AND NOT public.has_pro_access((SELECT created_by FROM public.topics WHERE id = p_topic_id)) THEN
    RETURN 'pro_required';
  END IF;
  DELETE FROM public.topic_slug_history WHERE old_slug = s AND topic_id = p_topic_id;
  INSERT INTO public.topic_slug_history (old_slug, topic_id) VALUES (old, p_topic_id)
    ON CONFLICT (old_slug) DO UPDATE SET topic_id = EXCLUDED.topic_id;
  UPDATE public.topics SET slug = s, updated_at = now() WHERE id = p_topic_id;
  RETURN 'ok';
END $$;

-- Owner's own daily cap (Pro can raise it).
CREATE OR REPLACE FUNCTION public.set_my_daily_credit_cap(p_cap integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := (select auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF p_cap IS NOT NULL AND (p_cap < 1 OR p_cap > 5000) THEN RAISE EXCEPTION 'invalid cap'; END IF;
  INSERT INTO public.user_credits(user_id, credits_balance, total_credits_purchased, total_credits_used, daily_credit_cap)
  VALUES (uid, 0, 0, 0, p_cap) ON CONFLICT (user_id) DO UPDATE SET daily_credit_cap = p_cap, updated_at = now();
  RETURN p_cap;
END $$;
REVOKE ALL ON FUNCTION public.set_my_daily_credit_cap(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_daily_credit_cap(integer) TO authenticated;