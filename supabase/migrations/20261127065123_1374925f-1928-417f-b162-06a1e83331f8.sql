CREATE OR REPLACE FUNCTION public.mcp_studio_write(p_tool text,p_client_id text,p_topic_id uuid DEFAULT NULL,p_credits int DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid := (select auth.uid()); s jsonb; n int; v int;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in to Curatr first.' USING ERRCODE='42501'; END IF;
 IF p_topic_id IS NOT NULL AND (NOT can_manage_topic(p_topic_id) OR NOT EXISTS(SELECT 1 FROM topics WHERE id=p_topic_id AND created_by=u AND NOT coalesce(is_archived,false))) THEN RAISE EXCEPTION 'That feed is not one you own.' USING ERRCODE='42501'; END IF;
 IF p_tool NOT IN ('draft_feed','update_sources','set_branding','pin_stories','get_preview') THEN RAISE EXCEPTION 'Unknown tool'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('studio:'||u::text,0));
 SELECT version INTO v FROM mcp_studio_grants WHERE user_id=u AND client_id=p_client_id;
 IF coalesce(v,0)<2 THEN RAISE EXCEPTION 'To allow changes, disconnect Curatr and connect it again.' USING ERRCODE='42501'; END IF;
 s := billing_owner_status(u);
 IF p_tool <> 'get_preview' THEN
 SELECT count(*) INTO n FROM usage_events WHERE payer_id=u AND actor='mcp_studio' AND kind='studio_write' AND created_at>now()-interval '1 hour';
 IF n>=30 THEN RAISE EXCEPTION 'Too many changes. Try again in an hour.'; END IF;
 END IF;
 IF p_tool='draft_feed' THEN
 SELECT count(*) INTO n FROM usage_events WHERE payer_id=u AND actor='mcp_studio' AND kind='studio_write' AND ref_id='draft_feed' AND created_at>=date_trunc('day',now());
 IF n>=5 THEN RAISE EXCEPTION 'You have made five draft feeds today. Try again tomorrow.'; END IF;
 IF coalesce((s->>'enforce')::boolean,false) AND NOT coalesce((s->>'is_pro')::boolean,false) AND NOT coalesce((s->>'exempt')::boolean,false) AND EXISTS(SELECT 1 FROM topics WHERE created_by=u) THEN RAISE EXCEPTION 'Free accounts have one feed. Upgrade: https://curatr.pro/pricing'; END IF;
 END IF;
 IF p_credits>0 AND NOT coalesce((s->>'exempt')::boolean,false) THEN
 IF coalesce((s->>'balance')::int,0)<p_credits THEN RAISE EXCEPTION 'Out of credits. Top up: https://curatr.pro/usage'; END IF;
 IF coalesce((s->>'today_credits')::int,0)+p_credits>coalesce((s->>'daily_cap')::int,0) THEN RAISE EXCEPTION 'You have reached today''s credit limit. Try again tomorrow.'; END IF;
 END IF;
 INSERT INTO usage_events(payer_id,topic_id,actor,kind,credits,stories,shadow,outcome,ref_id) VALUES(u,p_topic_id,'mcp_studio',CASE WHEN p_tool='get_preview' THEN 'studio_preview' ELSE 'studio_write' END,0,0,true,'allowed',p_tool);
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.mcp_studio_write(text,text,uuid,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_studio_write(text,text,uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_studio_result(p_tool text,p_topic_id uuid,p_outcome text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (select auth.uid()) IS NULL OR NOT can_manage_topic(p_topic_id) OR NOT EXISTS(SELECT 1 FROM topics WHERE id=p_topic_id AND created_by=(select auth.uid())) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 INSERT INTO usage_events(payer_id,topic_id,actor,kind,credits,stories,shadow,outcome,ref_id) VALUES((select auth.uid()),p_topic_id,'mcp_studio','studio_result',0,0,true,left(p_outcome,60),left(p_tool,60));
END $$;
REVOKE ALL ON FUNCTION public.mcp_studio_result(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_studio_result(text,uuid,text) TO authenticated;

CREATE POLICY "Private feed slides stay private" ON public.slides AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.stories s WHERE s.id=slides.story_id));

CREATE TABLE public.feed_handover_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, created_by uuid NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.feed_handover_tokens TO authenticated;
GRANT ALL ON public.feed_handover_tokens TO service_role;
ALTER TABLE public.feed_handover_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator views handovers" ON public.feed_handover_tokens FOR SELECT TO authenticated USING(created_by=(select auth.uid()));

CREATE OR REPLACE FUNCTION public.create_feed_handover(p_topic_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid := (select auth.uid()); t text;
BEGIN
 IF u IS NULL OR NOT can_manage_topic(p_topic_id) OR NOT (has_role(u,'admin') OR has_role(u,'superadmin')) OR NOT EXISTS(SELECT 1 FROM topics WHERE id=p_topic_id AND created_by=u AND NOT is_public AND NOT coalesce(is_archived,false)) THEN RAISE EXCEPTION 'Only your own private demo feed can be handed over.' USING ERRCODE='42501'; END IF;
 t:=encode(gen_random_bytes(32),'hex');
 INSERT INTO feed_handover_tokens(topic_id,token_hash,created_by) VALUES(p_topic_id,encode(digest(t,'sha256'),'hex'),u);
 RETURN t;
END $$;
CREATE OR REPLACE FUNCTION public.claim_feed_handover(p_token text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid := (select auth.uid()); h feed_handover_tokens; t topics;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in to accept this feed.' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM feed_handover_tokens WHERE token_hash=encode(digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF h.id IS NULL OR h.used_at IS NOT NULL OR h.expires_at<=now() THEN RAISE EXCEPTION 'This hand-over link is no longer available.'; END IF;
 SELECT * INTO t FROM topics WHERE id=h.topic_id FOR UPDATE;
 IF NOT can_manage_topic(t.id) AND h.created_by<>t.created_by THEN RAISE EXCEPTION 'This hand-over link is no longer available.'; END IF;
 IF t.created_by<>h.created_by OR t.is_public OR coalesce(t.is_archived,false) OR u=t.created_by THEN RAISE EXCEPTION 'Only a private demo can be accepted by another account.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('feed-owner:'||u::text,0));
 IF NOT has_pro_access(u) AND NOT coalesce((SELECT billing_exempt FROM user_credits WHERE user_id=u),false) AND EXISTS(SELECT 1 FROM topics WHERE created_by=u) THEN RAISE EXCEPTION 'Free accounts have one feed. Upgrade: https://curatr.pro/pricing'; END IF;
 UPDATE topics SET created_by=u,updated_at=now() WHERE id=t.id;
 -- Remove the previous owner's delegated membership; future access belongs to the recipient.
 DELETE FROM topic_memberships WHERE topic_id=t.id AND user_id=h.created_by;
 UPDATE feed_handover_tokens SET used_at=now() WHERE topic_id=t.id AND used_at IS NULL;
 RETURN t.slug;
END $$;
REVOKE ALL ON FUNCTION public.create_feed_handover(uuid),public.claim_feed_handover(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_feed_handover(uuid),public.claim_feed_handover(text) TO authenticated;