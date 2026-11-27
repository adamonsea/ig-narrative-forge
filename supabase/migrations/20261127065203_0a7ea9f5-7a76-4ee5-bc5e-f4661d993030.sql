CREATE INDEX feed_handover_tokens_topic_idx ON public.feed_handover_tokens(topic_id);
ALTER TABLE public.feed_health ADD COLUMN health_basis text NOT NULL DEFAULT 'stories', ADD COLUMN last_event_at timestamptz;
CREATE OR REPLACE FUNCTION public.compute_feed_health() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n int:=0; v_status text; v_reason text; v_action text; v_total int; v_broken int; v_stuck int; v_failed int; v_ev int; v_last timestamptz; v_cnt int; v_gap interval; v_quiet interval; v_basis text; v_event_last timestamptz;
BEGIN
 FOR r IN SELECT id,feed_lead FROM topics WHERE is_active AND NOT coalesce(is_archived,false) LOOP
 v_basis := CASE WHEN r.feed_lead='events' THEN 'events' ELSE 'stories' END;
 SELECT max(created_at) INTO v_event_last FROM events WHERE topic_id=r.id AND status<>'excluded';
 SELECT count(*) INTO v_ev FROM event_sources WHERE topic_id=r.id AND is_active AND (coalesce(consecutive_empty_checks,0)>=3 OR last_error IS NOT NULL);
 IF v_basis='events' THEN
 SELECT count(*),count(*) FILTER(WHERE coalesce(consecutive_empty_checks,0)>=3 OR last_error IS NOT NULL) INTO v_total,v_broken FROM event_sources WHERE topic_id=r.id AND is_active;
 v_stuck:=0;v_failed:=0;
 WITH p AS(SELECT created_at ts FROM events WHERE topic_id=r.id AND status<>'excluded' AND created_at>now()-interval '14 days'),g AS(SELECT ts-lag(ts) OVER(ORDER BY ts) gap FROM p)
 SELECT (SELECT max(ts) FROM p),(SELECT count(*) FROM p),(SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY gap) FROM g WHERE gap>interval '0') INTO v_last,v_cnt,v_gap;
 ELSE
 SELECT count(*),count(*) FILTER(WHERE coalesce(cs.consecutive_failures,0)>=3) INTO v_total,v_broken FROM topic_sources ts JOIN content_sources cs ON cs.id=ts.source_id WHERE ts.topic_id=r.id AND ts.is_active AND cs.is_active;
 SELECT count(*) INTO v_stuck FROM content_generation_queue q JOIN topic_articles ta ON ta.id=q.topic_article_id WHERE ta.topic_id=r.id AND q.status='processing' AND q.started_at<now()-interval '30 minutes';
 SELECT count(*) INTO v_failed FROM content_generation_queue q JOIN topic_articles ta ON ta.id=q.topic_article_id WHERE ta.topic_id=r.id AND q.status='failed' AND coalesce(q.completed_at,q.created_at)>now()-interval '24 hours';
 WITH p AS(SELECT s.published_at FROM stories s JOIN topic_articles ta ON ta.id=s.topic_article_id WHERE ta.topic_id=r.id AND s.is_published AND s.published_at>now()-interval '14 days'),g AS(SELECT published_at-lag(published_at) OVER(ORDER BY published_at) gap FROM p)
 SELECT (SELECT max(published_at) FROM p),(SELECT count(*) FROM p),(SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY gap) FROM g WHERE gap IS NOT NULL) INTO v_last,v_cnt,v_gap;
 END IF;
 v_quiet:=greatest(coalesce(v_gap,interval '0')*4,interval '24 hours');
 v_status:='green';v_reason:=NULL;v_action:=NULL;
 IF v_total>0 AND v_broken=v_total THEN v_status:='red';v_reason:='All sources stopped working';v_action:=v_broken||' sources stopped working';
 ELSIF v_cnt>=5 AND v_last<now()-v_quiet THEN v_status:='red';v_reason:='No new '||v_basis||' for '||round(extract(epoch FROM now()-v_last)/3600)||' hours';
 ELSIF v_broken>0 THEN v_status:='amber';v_reason:=v_broken||CASE WHEN v_broken=1 THEN ' source stopped working' ELSE ' sources stopped working' END;v_action:=v_reason;
 ELSIF v_basis='events' AND NOT EXISTS(SELECT 1 FROM events WHERE topic_id=r.id AND status<>'excluded' AND coalesce(end_date,start_date)>=current_date) THEN v_status:='amber';v_reason:='No upcoming events';v_action:='Check event sources';
 ELSIF v_stuck>0 THEN v_status:='amber';v_reason:=v_stuck||' stories stuck in writing';
 ELSIF v_failed>=3 THEN v_status:='amber';v_reason:=v_failed||' story summaries failed today';
 ELSIF v_ev>0 THEN v_status:='amber';v_reason:=v_ev||CASE WHEN v_ev=1 THEN ' events source not working' ELSE ' events sources not working' END;v_action:=v_reason;
 END IF;
 INSERT INTO feed_health AS fh(topic_id,status,reason,owner_action,broken_sources,checked_at,changed_at,red_since,health_basis,last_event_at)
 VALUES(r.id,v_status,v_reason,v_action,CASE WHEN v_basis='events' THEN v_broken ELSE v_broken+v_ev END,now(),now(),CASE WHEN v_status='red' THEN now() END,v_basis,v_event_last)
 ON CONFLICT(topic_id) DO UPDATE SET reason=excluded.reason,owner_action=excluded.owner_action,broken_sources=excluded.broken_sources,checked_at=now(),changed_at=CASE WHEN fh.status<>excluded.status THEN now() ELSE fh.changed_at END,red_since=CASE WHEN excluded.status<>'red' THEN NULL WHEN fh.status='red' THEN fh.red_since ELSE now() END,emailed_at=CASE WHEN excluded.status='red' AND fh.status<>'red' THEN NULL WHEN excluded.status<>'red' THEN NULL ELSE fh.emailed_at END,status=excluded.status,health_basis=excluded.health_basis,last_event_at=excluded.last_event_at;
 n:=n+1;
 END LOOP;
 DELETE FROM feed_health WHERE topic_id IN(SELECT id FROM topics WHERE NOT is_active OR coalesce(is_archived,false));
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.compute_feed_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compute_feed_health() TO service_role;
CREATE OR REPLACE FUNCTION public.mcp_studio_health() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'Sign in to Curatr first.' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM(SELECT f.*,coalesce(h.health_basis,'stories') health_basis,h.last_event_at FROM mcp_studio_feeds() f LEFT JOIN feed_health h ON h.topic_id=f.id WHERE can_manage_topic(f.id))x);
END $$;
REVOKE ALL ON FUNCTION public.mcp_studio_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_studio_health() TO authenticated;
SELECT public.compute_feed_health();