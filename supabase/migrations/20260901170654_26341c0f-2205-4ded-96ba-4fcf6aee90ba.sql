-- 1. Protection flag on topics
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS deletion_protected boolean NOT NULL DEFAULT true;

UPDATE public.topics SET deletion_protected = true WHERE deletion_protected IS DISTINCT FROM true;

-- 2. Backups table
CREATE TABLE IF NOT EXISTS public.topic_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL,
  topic_name text NOT NULL,
  topic_slug text,
  owner_id uuid,
  reason text NOT NULL DEFAULT 'manual',
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.topic_backups TO authenticated;
GRANT ALL ON public.topic_backups TO service_role;

ALTER TABLE public.topic_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins read their topic backups"
  ON public.topic_backups
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_topic_backups_topic_created
  ON public.topic_backups (topic_id, created_at DESC);

CREATE TRIGGER update_topic_backups_updated_at
  BEFORE UPDATE ON public.topic_backups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Snapshot builder (internal)
CREATE OR REPLACE FUNCTION public.build_topic_snapshot(p_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic topics%ROWTYPE;
BEGIN
  SELECT * INTO v_topic FROM topics WHERE id = p_topic_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'captured_at', now(),
    'topic', to_jsonb(v_topic),
    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(cs))
      FROM topic_sources ts
      JOIN content_sources cs ON cs.id = ts.source_id
      WHERE ts.topic_id = p_topic_id
    ), '[]'::jsonb),
    'topic_sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(ts))
      FROM topic_sources ts
      WHERE ts.topic_id = p_topic_id
    ), '[]'::jsonb),
    'automation_settings', COALESCE((
      SELECT jsonb_agg(to_jsonb(a))
      FROM topic_automation_settings a
      WHERE a.topic_id = p_topic_id
    ), '[]'::jsonb),
    'newsletter_signups', COALESCE((
      SELECT jsonb_agg(to_jsonb(n))
      FROM topic_newsletter_signups n
      WHERE n.topic_id = p_topic_id
    ), '[]'::jsonb),
    'email_segments', COALESCE((
      SELECT jsonb_agg(to_jsonb(e))
      FROM email_segments e
      WHERE e.topic_id = p_topic_id
    ), '[]'::jsonb),
    'published_stories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'slug', s.slug, 'published_at', s.published_at
      ))
      FROM stories s
      JOIN articles a ON a.id = s.article_id
      WHERE a.topic_id = p_topic_id AND s.is_published = true
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'articles', (SELECT count(*) FROM articles WHERE topic_id = p_topic_id),
      'topic_articles', (SELECT count(*) FROM topic_articles WHERE topic_id = p_topic_id),
      'sources', (SELECT count(*) FROM topic_sources WHERE topic_id = p_topic_id),
      'subscribers', (SELECT count(*) FROM topic_newsletter_signups WHERE topic_id = p_topic_id AND is_active = true)
    )
  );
END;
$$;

-- 4. Create a backup row (callable by owner/admin, and internally)
CREATE OR REPLACE FUNCTION public.create_topic_backup(p_topic_id uuid, p_reason text DEFAULT 'manual')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic topics%ROWTYPE;
  v_snapshot jsonb;
  v_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_topic FROM topics WHERE id = p_topic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Topic not found';
  END IF;

  IF v_uid IS NOT NULL
     AND v_topic.created_by IS DISTINCT FROM v_uid
     AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to back up this topic';
  END IF;

  v_snapshot := public.build_topic_snapshot(p_topic_id);

  INSERT INTO topic_backups (topic_id, topic_name, topic_slug, owner_id, reason, snapshot)
  VALUES (p_topic_id, v_topic.name, v_topic.slug, v_topic.created_by, COALESCE(p_reason, 'manual'), v_snapshot)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_topic_backup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_topic_backup(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.build_topic_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_topic_snapshot(uuid) TO service_role;

-- 5. Guard archive / unpublish-by-archive
CREATE OR REPLACE FUNCTION public.guard_topic_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_archived, false) = true AND COALESCE(OLD.is_archived, false) = false THEN
    IF COALESCE(OLD.deletion_protected, false) = true AND COALESCE(NEW.deletion_protected, false) = true THEN
      RAISE EXCEPTION 'Feed "%" is protected. Turn off deletion protection before archiving it.', OLD.name
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO topic_backups (topic_id, topic_name, topic_slug, owner_id, reason, snapshot)
    VALUES (OLD.id, OLD.name, OLD.slug, OLD.created_by, 'pre_archive', public.build_topic_snapshot(OLD.id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_topic_archive_trigger ON public.topics;
CREATE TRIGGER guard_topic_archive_trigger
  BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.guard_topic_archive();

-- 6. Guard hard deletion
CREATE OR REPLACE FUNCTION public.guard_topic_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.deletion_protected, false) = true THEN
    RAISE EXCEPTION 'Feed "%" is protected. Turn off deletion protection before deleting it.', OLD.name
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO topic_backups (topic_id, topic_name, topic_slug, owner_id, reason, snapshot)
  VALUES (OLD.id, OLD.name, OLD.slug, OLD.created_by, 'pre_delete', public.build_topic_snapshot(OLD.id));

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_topic_delete_trigger ON public.topics;
CREATE TRIGGER guard_topic_delete_trigger
  BEFORE DELETE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.guard_topic_delete();

-- 7. Restore from a backup
CREATE OR REPLACE FUNCTION public.restore_topic_from_backup(p_backup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backup topic_backups%ROWTYPE;
  v_uid uuid := auth.uid();
  v_topic_json jsonb;
  v_exists boolean;
  v_sources int := 0;
  v_signups int := 0;
BEGIN
  SELECT * INTO v_backup FROM topic_backups WHERE id = p_backup_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Backup not found';
  END IF;

  IF v_uid IS NOT NULL
     AND v_backup.owner_id IS DISTINCT FROM v_uid
     AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to restore this backup';
  END IF;

  v_topic_json := v_backup.snapshot -> 'topic';
  SELECT EXISTS(SELECT 1 FROM topics WHERE id = v_backup.topic_id) INTO v_exists;

  IF v_exists THEN
    -- Bring the feed back to life and restore its configuration
    UPDATE topics t
    SET name = r.name,
        description = r.description,
        keywords = r.keywords,
        landmarks = r.landmarks,
        organizations = r.organizations,
        negative_keywords = r.negative_keywords,
        competing_regions = r.competing_regions,
        region = r.region,
        is_archived = false,
        archived_at = NULL,
        archived_by = NULL,
        is_active = r.is_active,
        is_public = r.is_public,
        deletion_protected = true,
        updated_at = now()
    FROM jsonb_populate_record(NULL::topics, v_topic_json) r
    WHERE t.id = v_backup.topic_id;
  ELSE
    INSERT INTO topics
    SELECT (jsonb_populate_record(NULL::topics, v_topic_json)).*;

    UPDATE topics
    SET is_archived = false, archived_at = NULL, archived_by = NULL, deletion_protected = true, updated_at = now()
    WHERE id = v_backup.topic_id;
  END IF;

  -- Restore source links (sources themselves recreated when missing)
  INSERT INTO content_sources
  SELECT (jsonb_populate_record(NULL::content_sources, s)).*
  FROM jsonb_array_elements(COALESCE(v_backup.snapshot -> 'sources', '[]'::jsonb)) s
  WHERE NOT EXISTS (
    SELECT 1 FROM content_sources cs WHERE cs.id = (s ->> 'id')::uuid
  );

  INSERT INTO topic_sources
  SELECT (jsonb_populate_record(NULL::topic_sources, ts)).*
  FROM jsonb_array_elements(COALESCE(v_backup.snapshot -> 'topic_sources', '[]'::jsonb)) ts
  WHERE NOT EXISTS (
    SELECT 1 FROM topic_sources x
    WHERE x.topic_id = (ts ->> 'topic_id')::uuid AND x.source_id = (ts ->> 'source_id')::uuid
  );
  GET DIAGNOSTICS v_sources = ROW_COUNT;

  -- Restore subscribers that are missing
  INSERT INTO topic_newsletter_signups
  SELECT (jsonb_populate_record(NULL::topic_newsletter_signups, n)).*
  FROM jsonb_array_elements(COALESCE(v_backup.snapshot -> 'newsletter_signups', '[]'::jsonb)) n
  WHERE NOT EXISTS (
    SELECT 1 FROM topic_newsletter_signups x WHERE x.id = (n ->> 'id')::uuid
  );
  GET DIAGNOSTICS v_signups = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'topic_id', v_backup.topic_id,
    'recreated_topic', NOT v_exists,
    'sources_restored', v_sources,
    'subscribers_restored', v_signups
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_topic_from_backup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_topic_from_backup(uuid) TO authenticated, service_role;

-- 8. Nightly backups of every live feed + retention
CREATE OR REPLACE FUNCTION public.run_nightly_topic_backups()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  FOR r IN SELECT id, name, slug, created_by FROM topics WHERE COALESCE(is_archived, false) = false LOOP
    INSERT INTO topic_backups (topic_id, topic_name, topic_slug, owner_id, reason, snapshot)
    VALUES (r.id, r.name, r.slug, r.created_by, 'scheduled', public.build_topic_snapshot(r.id));
    v_count := v_count + 1;
  END LOOP;

  -- Keep the 30 most recent backups per topic
  DELETE FROM topic_backups tb
  WHERE tb.id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY topic_id ORDER BY created_at DESC) AS rn
      FROM topic_backups
    ) ranked
    WHERE ranked.rn > 30
  );

  RETURN jsonb_build_object('success', true, 'backups_created', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.run_nightly_topic_backups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_nightly_topic_backups() TO service_role;

SELECT cron.schedule('nightly-topic-backups', '15 3 * * *', $$SELECT public.run_nightly_topic_backups();$$);
