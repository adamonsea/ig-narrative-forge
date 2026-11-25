ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS billing_enforce_test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.billing_enforced_for(p_user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT public.billing_enforced() OR coalesce((SELECT billing_enforce_test FROM public.user_credits WHERE user_id = p_user), false) $f$;

REVOKE EXECUTE ON FUNCTION public.billing_enforced_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_enforced_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_owner_status(p_user uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    'enforce', public.billing_enforced_for(p_user)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.create_feed_api_token(p_topic_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE tok text;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF public.billing_enforced_for((SELECT created_by FROM topics WHERE id = p_topic_id)) AND NOT public.has_pro_access((SELECT created_by FROM topics WHERE id = p_topic_id)) THEN
    RAISE EXCEPTION 'pro_required' USING ERRCODE = 'P0001';
  END IF;
  UPDATE feed_api_tokens SET revoked_at = now() WHERE topic_id = p_topic_id AND revoked_at IS NULL;
  tok := 'cfa_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO feed_api_tokens(topic_id, token_hash, token_prefix, created_by)
  VALUES (p_topic_id, encode(digest(tok, 'sha256'), 'hex'), left(tok, 10), auth.uid());
  RETURN tok;
END $function$;

CREATE OR REPLACE FUNCTION public.enforce_free_feed_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.created_by IS NULL OR NOT public.billing_enforced_for(NEW.created_by) OR public.has_pro_access(NEW.created_by)
     OR coalesce((SELECT billing_exempt FROM public.user_credits WHERE user_id = NEW.created_by), false) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.topics WHERE created_by = NEW.created_by) THEN
    RAISE EXCEPTION 'free_feed_limit' USING ERRCODE = 'P0001', HINT = 'Free accounts have one feed. Upgrade to Pro for more.';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.get_feed_billing_state(p_topic_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid; v_reason text;
BEGIN
  IF NOT public.can_manage_topic(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  SELECT created_by INTO v_owner FROM public.topics WHERE id = p_topic_id;
  v_reason := coalesce(public.automation_pause_reason(v_owner, 'gather'), public.automation_pause_reason(v_owner, 'picture'));
  RETURN jsonb_build_object(
    'paused', public.billing_enforced_for(v_owner) AND v_reason IS NOT NULL AND v_reason <> 'no_owner',
    'would_pause', v_reason,
    'is_pro', public.has_pro_access(v_owner));
END $function$;

CREATE OR REPLACE FUNCTION public.set_feed_handle(p_topic_id uuid, p_slug text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s text := lower(trim(p_slug)); old text; verdict text;
BEGIN
  verdict := public.check_feed_handle(p_topic_id, s);
  IF verdict <> 'ok' THEN RETURN verdict; END IF;
  SELECT slug INTO old FROM public.topics WHERE id = p_topic_id;
  IF old = s THEN RETURN 'ok'; END IF;
  IF public.billing_enforced_for((SELECT created_by FROM public.topics WHERE id = p_topic_id)) AND NOT public.has_pro_access((SELECT created_by FROM public.topics WHERE id = p_topic_id)) THEN
    RETURN 'pro_required';
  END IF;
  DELETE FROM public.topic_slug_history WHERE old_slug = s AND topic_id = p_topic_id;
  INSERT INTO public.topic_slug_history (old_slug, topic_id) VALUES (old, p_topic_id)
    ON CONFLICT (old_slug) DO UPDATE SET topic_id = EXCLUDED.topic_id;
  UPDATE public.topics SET slug = s, updated_at = now() WHERE id = p_topic_id;
  RETURN 'ok';
END $function$;