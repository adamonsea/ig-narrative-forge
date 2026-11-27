-- Transactional checks using the real test account. All fixtures and account changes roll back.
DO $test$
DECLARE owner_id uuid; admin_id uuid; tid uuid; token text; s uuid; result text; rejected boolean; n int;
BEGIN
 SELECT id INTO owner_id FROM auth.users WHERE email='amd@lindoneast.com';
 SELECT u.id INTO admin_id FROM auth.users u WHERE EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','superadmin')) AND has_pro_access(u.id) ORDER BY u.created_at LIMIT 1;
 IF owner_id IS NULL OR admin_id IS NULL THEN RAISE EXCEPTION 'Real owner and administrator accounts are required'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  INSERT INTO mcp_studio_grants(user_id,client_id,client_name,version) VALUES(owner_id,'zztest-studio','Studio test',1);
  rejected:=false; BEGIN PERFORM mcp_studio_write('draft_feed','zztest-studio',NULL,0); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'level 1 could write'; END IF;
  UPDATE mcp_studio_grants SET version=2 WHERE user_id=owner_id AND client_id='zztest-studio';
  UPDATE user_credits SET credits_balance=0 WHERE user_id=owner_id;
  rejected:=false; BEGIN PERFORM mcp_studio_write('pin_stories','zztest-studio',NULL,1); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'zero-credit Add story allowed'; END IF;
  UPDATE user_credits SET credits_balance=20,billing_enforce_test=true WHERE user_id=owner_id;
  rejected:=false; BEGIN PERFORM mcp_studio_write('draft_feed','zztest-studio',NULL,0); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Free second feed was allowed'; END IF;
  UPDATE user_credits SET billing_enforce_test=false WHERE user_id=owner_id;
  INSERT INTO topics(name,slug,created_by,is_public,is_active) VALUES('Studio test','zztest-studio-private-'||left(gen_random_uuid()::text,8),admin_id,false,true) RETURNING id INTO tid;
  rejected:=false; BEGIN PERFORM mcp_studio_write('set_branding','zztest-studio',tid,0); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Owner could change another account feed'; END IF;
  PERFORM set_config('request.jwt.claim.role','anon',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','anon')::text,true);
  IF coalesce(reader_can_access_feed(tid),false) THEN RAISE EXCEPTION 'Anonymous private feed access'; END IF;
  SELECT count(*) INTO n FROM get_topic_stories_with_keywords(tid); IF n<>0 THEN RAISE EXCEPTION 'Private stories leaked'; END IF;
  rejected:=false; BEGIN PERFORM mcp_studio_write('draft_feed','zztest-studio',NULL,0); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Anonymous write allowed'; END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  IF NOT reader_can_access_feed(tid) THEN RAISE EXCEPTION 'Owner preview refused'; END IF;
  token:=create_feed_handover(tid);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  rejected:=false; BEGIN PERFORM claim_feed_handover(token); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Free hand-over cap bypassed'; END IF;
  rejected:=false; BEGIN PERFORM create_feed_handover(tid); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Non-admin made a hand-over'; END IF;
  -- Fixture from the normal owner's account, accepted by the existing Pro administrator.
  UPDATE topics SET created_by=owner_id WHERE id=tid;
  UPDATE feed_handover_tokens SET created_by=owner_id WHERE topic_id=tid;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  result:=claim_feed_handover(token);
  IF NOT EXISTS(SELECT 1 FROM topics WHERE id=tid AND created_by=admin_id AND NOT is_public) THEN RAISE EXCEPTION 'Hand-over did not preserve privacy and transfer ownership'; END IF;
  rejected:=false; BEGIN PERFORM claim_feed_handover(token); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Hand-over token was reused'; END IF;
  token:=create_feed_handover(tid);
  UPDATE feed_handover_tokens SET expires_at=now()-interval '1 second' WHERE topic_id=tid AND used_at IS NULL;
  rejected:=false; BEGIN PERFORM claim_feed_handover(token); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expired hand-over token was accepted'; END IF;
  -- Rate limits are per account, not per client. Fixtures use a distinctive marker.
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  INSERT INTO usage_events(payer_id,actor,kind,credits,stories,shadow,outcome,ref_id) SELECT owner_id,'mcp_studio','studio_write',0,0,true,'allowed','draft_feed' FROM generate_series(1,5);
  rejected:=false; BEGIN PERFORM mcp_studio_write('draft_feed','zztest-studio',NULL,0); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Five-draft daily cap bypassed'; END IF;
  INSERT INTO usage_events(payer_id,actor,kind,credits,stories,shadow,outcome,ref_id) SELECT owner_id,'mcp_studio','studio_write',0,0,true,'allowed','set_branding' FROM generate_series(1,30);
  rejected:=false; BEGIN PERFORM mcp_studio_write('set_branding','zztest-studio',NULL,0); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Thirty-write hourly cap bypassed'; END IF;
  RAISE EXCEPTION 'zztest_success_rollback';
 EXCEPTION WHEN others THEN
  IF sqlerrm<>'zztest_success_rollback' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'Studio Phase 2 owner, privacy, credits, caps, hand-over and rate checks passed; all fixtures rolled back';
END $test$;
