CREATE TABLE IF NOT EXISTS public.queue_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL UNIQUE,
  job_id uuid,
  last_notified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.queue_alert_log TO service_role;
ALTER TABLE public.queue_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue_alert_log_service_only" ON public.queue_alert_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_queue_alert_log_notified ON public.queue_alert_log(last_notified_at DESC);

-- Schedule monitor
DO $$
DECLARE
  supabase_url text := 'https://kwzeepndsipbwtvjthtq.supabase.co';
  anon_key text := current_setting('app.settings.anon_key', true);
BEGIN
  PERFORM cron.unschedule('queue-alert-monitor-15min') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'queue-alert-monitor-15min'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'queue-alert-monitor-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kwzeepndsipbwtvjthtq.supabase.co/functions/v1/queue-alert-monitor',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);