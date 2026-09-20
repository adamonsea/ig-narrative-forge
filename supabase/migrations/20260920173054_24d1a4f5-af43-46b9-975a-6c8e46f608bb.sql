CREATE OR REPLACE FUNCTION public.set_topic_distribution(p_topic_id uuid, p_field text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_allowed boolean;
BEGIN
  SELECT created_by INTO v_owner FROM public.topics WHERE id = p_topic_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_allowed := v_owner = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'superadmin'::public.app_role);
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF p_field NOT IN ('is_public', 'email_subscriptions_enabled', 'rss_enabled', 'public_widget_builder_enabled', 'mcp_enabled', 'audio_briefings_daily_enabled', 'audio_briefings_weekly_enabled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_field');
  END IF;

  IF p_enabled AND NOT public.has_pro_access(v_owner) THEN
    RETURN jsonb_build_object('success', false, 'error', 'pro_required');
  END IF;

  IF p_field = 'is_public' THEN
    UPDATE public.topics SET is_public = p_enabled, is_active = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'email_subscriptions_enabled' THEN
    UPDATE public.topics SET email_subscriptions_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'rss_enabled' THEN
    UPDATE public.topics SET rss_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'public_widget_builder_enabled' THEN
    UPDATE public.topics SET public_widget_builder_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'mcp_enabled' THEN
    UPDATE public.topics SET mcp_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'audio_briefings_daily_enabled' THEN
    UPDATE public.topics SET audio_briefings_daily_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSE
    UPDATE public.topics SET audio_briefings_weekly_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'field', p_field, 'enabled', p_enabled);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_topic_distribution(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_topic_distribution(uuid, text, boolean) TO authenticated, service_role;