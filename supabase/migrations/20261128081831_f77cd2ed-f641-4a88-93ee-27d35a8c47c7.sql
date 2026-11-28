CREATE OR REPLACE FUNCTION public._impl_approve_article_for_generation(article_uuid uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$ DECLARE v_topic_id uuid; BEGIN
SELECT a.topic_id INTO v_topic_id FROM public.articles a WHERE a.id=article_uuid;
IF NOT public.is_internal_or_admin() AND (v_topic_id IS NULL OR NOT public.can_manage_topic(v_topic_id)) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
IF EXISTS (SELECT 1 FROM articles WHERE id=article_uuid AND processing_status IN ('new','processed')) AND NOT EXISTS (SELECT 1 FROM content_generation_queue WHERE article_id=article_uuid AND status!='completed') THEN
UPDATE articles SET processing_status='processed',updated_at=now() WHERE id=article_uuid;
INSERT INTO content_generation_queue(article_id,slidetype,status,created_at) VALUES(article_uuid,'feed','pending',now()); RETURN true; END IF; RETURN false; END $$;