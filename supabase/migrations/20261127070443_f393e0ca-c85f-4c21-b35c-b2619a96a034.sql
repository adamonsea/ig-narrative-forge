CREATE OR REPLACE FUNCTION public.auto_publish_active_topics() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 -- Activity controls gathering; publication is an explicit owner decision.
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.claim_feed_handover(p_token text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid := (select auth.uid()); h feed_handover_tokens; t topics;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in to accept this feed.' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM feed_handover_tokens WHERE token_hash=encode(digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF h.id IS NULL OR h.used_at IS NOT NULL OR h.expires_at<=now() THEN RAISE EXCEPTION 'This hand-over link is no longer available.'; END IF;
 SELECT * INTO t FROM topics WHERE id=h.topic_id FOR UPDATE;
 IF t.created_by<>h.created_by OR t.is_public OR coalesce(t.is_archived,false) OR u=t.created_by THEN RAISE EXCEPTION 'Only a private demo can be accepted by another account.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('feed-owner:'||u::text,0));
 IF NOT has_pro_access(u) AND NOT coalesce((SELECT billing_exempt FROM user_credits WHERE user_id=u),false) AND EXISTS(SELECT 1 FROM topics WHERE created_by=u) THEN RAISE EXCEPTION 'Free accounts have one feed. Upgrade: https://curatr.pro/pricing'; END IF;
 UPDATE topics SET created_by=u,updated_at=now() WHERE id=t.id;
 DELETE FROM topic_memberships WHERE topic_id=t.id;
 INSERT INTO topic_memberships(topic_id,user_id,role) VALUES(t.id,u,'owner');
 IF t.topic_type='regional' AND t.region IS NOT NULL THEN INSERT INTO user_regions(user_id,region) VALUES(u,t.region) ON CONFLICT DO NOTHING; END IF;
 UPDATE feed_api_tokens SET revoked_at=now() WHERE topic_id=t.id AND revoked_at IS NULL;
 UPDATE topic_mcp_keys SET revoked_at=now() WHERE topic_id=t.id AND revoked_at IS NULL;
 UPDATE feed_handover_tokens SET used_at=now() WHERE topic_id=t.id AND used_at IS NULL;
 RETURN t.slug;
END $$;
REVOKE ALL ON FUNCTION public.claim_feed_handover(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_feed_handover(text) TO authenticated;