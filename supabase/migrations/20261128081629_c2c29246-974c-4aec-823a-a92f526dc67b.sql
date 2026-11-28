CREATE OR REPLACE FUNCTION public._impl_approve_article_for_generation(article_uuid uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$ BEGIN
IF EXISTS (SELECT 1 FROM articles WHERE id=article_uuid AND processing_status IN ('new','processed')) AND NOT EXISTS (SELECT 1 FROM content_generation_queue WHERE article_id=article_uuid AND status!='completed') THEN
UPDATE articles SET processing_status='processed',updated_at=now() WHERE id=article_uuid;
INSERT INTO content_generation_queue(article_id,slidetype,status,created_at) VALUES(article_uuid,'feed','pending',now()); RETURN true; END IF; RETURN false; END $$;
CREATE OR REPLACE FUNCTION public.auto_populate_content_queue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$ BEGIN
IF NOT is_feature_enabled('auto_simplify_articles') THEN RETURN NEW; END IF;
IF NEW.processing_status='processed' AND NEW.content_quality_score>=50 AND NEW.regional_relevance_score>=5 THEN
IF NOT EXISTS (SELECT 1 FROM content_generation_queue WHERE article_id=NEW.id AND status IN ('pending','processing')) THEN
INSERT INTO content_generation_queue(article_id,slidetype,status,created_at) VALUES(NEW.id,'feed','pending',now()); END IF; END IF; RETURN NEW; END $$;