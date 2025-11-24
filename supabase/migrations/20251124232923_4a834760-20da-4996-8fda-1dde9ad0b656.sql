-- ============================================
-- SOURCE STATUS AUDIT TABLE & TRIGGER
-- ============================================

-- Create audit table to track all source status changes
CREATE TABLE IF NOT EXISTS public.source_status_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.content_sources(id) ON DELETE CASCADE,
  old_status BOOLEAN,
  new_status BOOLEAN NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Add index for querying by source and time
CREATE INDEX IF NOT EXISTS idx_source_status_audit_source_id 
  ON public.source_status_audit(source_id);
CREATE INDEX IF NOT EXISTS idx_source_status_audit_changed_at 
  ON public.source_status_audit(changed_at DESC);

-- Enable RLS on audit table
ALTER TABLE public.source_status_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit table
CREATE POLICY "Service role can manage audit logs"
  ON public.source_status_audit
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Topic owners can view their source audit logs"
  ON public.source_status_audit
  FOR SELECT
  USING (
    source_id IN (
      SELECT cs.id FROM content_sources cs
      JOIN topics t ON t.id = cs.topic_id
      WHERE t.created_by = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ============================================
-- TRIGGER FUNCTION TO LOG STATUS CHANGES
-- ============================================

CREATE OR REPLACE FUNCTION public.log_source_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log if is_active actually changed
  IF (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    INSERT INTO public.source_status_audit (
      source_id,
      old_status,
      new_status,
      changed_by,
      change_reason,
      metadata
    ) VALUES (
      NEW.id,
      OLD.is_active,
      NEW.is_active,
      auth.uid(), -- Will be NULL for service role operations
      CASE
        WHEN NEW.consecutive_failures >= 3 THEN 'auto_deactivated_failures'
        WHEN NEW.is_active = false AND OLD.is_active = true THEN 'manual_deactivation'
        WHEN NEW.is_active = true AND OLD.is_active = false THEN 'manual_reactivation'
        ELSE 'status_change'
      END,
      jsonb_build_object(
        'consecutive_failures', NEW.consecutive_failures,
        'last_failure_reason', NEW.last_failure_reason,
        'total_failures', NEW.total_failures
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on content_sources
DROP TRIGGER IF EXISTS trigger_log_source_status_change ON public.content_sources;
CREATE TRIGGER trigger_log_source_status_change
  AFTER UPDATE ON public.content_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.log_source_status_change();

-- ============================================
-- ADD CRITICAL SOURCE FLAG
-- ============================================

-- Add is_critical column to content_sources for priority monitoring
ALTER TABLE public.content_sources 
ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false;

-- Add index for critical source queries
CREATE INDEX IF NOT EXISTS idx_content_sources_is_critical 
  ON public.content_sources(is_critical) 
  WHERE is_critical = true;

-- Log the migration
INSERT INTO public.system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Source status audit system deployed',
  jsonb_build_object(
    'tables_created', ARRAY['source_status_audit'],
    'triggers_created', ARRAY['trigger_log_source_status_change'],
    'columns_added', ARRAY['is_critical']
  ),
  'source_monitoring_migration'
);