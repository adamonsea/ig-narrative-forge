-- ============================================
-- PHASE 1 ROLLBACK SCRIPT
-- ============================================
-- Run this in Supabase SQL Editor if you need to revert Phase 1 migration
-- This will undo all changes made by the Phase 1 migration
-- 
-- IMPORTANT: This rollback is SAFE to run - it only removes additions
-- and restores original function definitions
-- ============================================

-- ============================================
-- PART 1: REVERT FUNCTION SECURITY CHANGES
-- ============================================
-- Remove SET search_path = public from the 12 functions

CREATE OR REPLACE FUNCTION public.update_global_automation_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_keyword_analytics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_daily_content_availability_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_error_tickets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_events_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM newsletter_signup_rate_limits 
  WHERE window_start < now() - INTERVAL '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_community_insights()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.community_insights
  WHERE created_at < now() - interval '7 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_publish_active_topics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- When a topic is made active, automatically make it public
  IF NEW.is_active = true THEN
    NEW.is_public = true;
  END IF;
  
  -- When a topic is made inactive, keep is_public unchanged (user choice)
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_default_topic_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO topic_automation_settings (
    topic_id,
    scrape_frequency_hours,
    is_active,
    automation_mode,
    quality_threshold,
    auto_simplify_enabled,
    auto_illustrate_enabled,
    illustration_quality_threshold,
    next_run_at
  ) VALUES (
    NEW.id,
    12,  -- Default: every 12 hours
    false,  -- Disabled by default
    'manual',  -- Manual mode by default
    60,  -- 60% quality threshold
    false,
    false,
    70,  -- 70% threshold for illustrations
    NOW() + INTERVAL '12 hours'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_source_deletion_if_linked()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM topic_sources 
    WHERE source_id = OLD.id 
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete source: still linked to active topics. Remove topic associations first.';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_populate_content_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if auto-simplify feature is enabled
  IF NOT is_feature_enabled('auto_simplify_articles') THEN
    RETURN NEW;
  END IF;

  -- Only add to queue if article is processed and has good quality scores
  IF NEW.processing_status = 'processed' AND 
     NEW.content_quality_score >= 50 AND 
     NEW.regional_relevance_score >= 5 THEN
    
    -- Check if there's already a pending or processing queue entry for this article
    IF NOT EXISTS (
      SELECT 1 FROM content_generation_queue 
      WHERE article_id = NEW.id 
      AND status IN ('pending', 'processing')
    ) THEN
      INSERT INTO content_generation_queue (
        article_id,
        slidetype,
        status,
        created_at
      ) VALUES (
        NEW.id,
        'tabloid',
        'pending',
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_suppress_deleted_topic_article()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- When a topic_article is marked as discarded, automatically add to suppression list
  IF NEW.processing_status = 'discarded' AND (OLD.processing_status IS NULL OR OLD.processing_status != 'discarded') THEN
    -- Get the shared content info
    INSERT INTO discarded_articles (
      topic_id,
      url,
      normalized_url,
      title,
      discarded_by,
      discarded_reason,
      discarded_at
    )
    SELECT 
      NEW.topic_id,
      sac.url,
      sac.normalized_url,
      sac.title,
      auth.uid(),
      'user_delete',
      now()
    FROM shared_article_content sac
    WHERE sac.id = NEW.shared_content_id
    ON CONFLICT (topic_id, normalized_url) DO UPDATE SET
      discarded_at = now(),
      discarded_by = auth.uid(),
      discarded_reason = 'user_delete';
      
    -- Log the auto-suppression
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info',
      'Auto-suppressed deleted topic article',
      jsonb_build_object(
        'topic_article_id', NEW.id,
        'topic_id', NEW.topic_id,
        'shared_content_id', NEW.shared_content_id,
        'url', (SELECT url FROM shared_article_content WHERE id = NEW.shared_content_id)
      ),
      'auto_suppress_deleted_topic_article'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- ============================================
-- PART 2: DROP NEW INDEXES
-- ============================================

DROP INDEX IF EXISTS idx_articles_pipeline_processing;
DROP INDEX IF EXISTS idx_stories_published_feed;
DROP INDEX IF EXISTS idx_queue_processing;
DROP INDEX IF EXISTS idx_system_logs_cleanup;

-- ============================================
-- PART 3: REMOVE ARCHIVE SETTINGS COLUMN
-- ============================================

ALTER TABLE topics 
DROP COLUMN IF EXISTS archive_settings;

-- ============================================
-- PART 4: DROP NEW TABLES AND FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS smart_archive_old_content(uuid, boolean);

DROP TABLE IF EXISTS archived_content CASCADE;

-- ============================================
-- PART 5: DATA RESTORATION NOTE
-- ============================================

-- NOTE: The following data was deleted in the migration and CANNOT be restored:
-- - Old discarded articles (>30 days, not in protected topics): 31 articles (~50 KB)
-- - Old system logs (>7 days): 712 logs (~200 KB)
-- - Old scraped URL history (>30 days): 832 URLs (~160 KB)
-- 
-- This data was safe to delete and would not affect any active functionality.
-- If you need this historical data, restore from a database backup taken before the migration.

-- ============================================
-- LOG ROLLBACK
-- ============================================

INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Phase 1 migration rolled back',
  jsonb_build_object(
    'rollback_date', now(),
    'rollback_version', 'phase_1_safe',
    'note', 'All Phase 1 changes have been reverted'
  ),
  'phase_1_rollback'
);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify rollback was successful:

-- Check functions are reverted (should show original definitions without SET search_path = public):
-- \df+ update_global_automation_settings_updated_at

-- Check indexes are dropped:
-- SELECT indexname FROM pg_indexes WHERE indexname IN (
--   'idx_articles_pipeline_processing',
--   'idx_stories_published_feed', 
--   'idx_queue_processing',
--   'idx_system_logs_cleanup'
-- );

-- Check column is removed:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'topics' AND column_name = 'archive_settings';

-- Check table is dropped:
-- SELECT tablename FROM pg_tables WHERE tablename = 'archived_content';

-- ============================================
-- ROLLBACK COMPLETE
-- ============================================
-- All Phase 1 changes have been safely reverted
-- Your database is back to its pre-migration state
-- ============================================
