-- Update the CHECK constraint to allow all engagement metric types
ALTER TABLE public.topic_engagement_metrics 
  DROP CONSTRAINT IF EXISTS topic_engagement_metrics_metric_type_check;

ALTER TABLE public.topic_engagement_metrics
  ADD CONSTRAINT topic_engagement_metrics_metric_type_check 
  CHECK (metric_type IN (
    'notification_enabled',
    'pwa_installed',
    'pwa_install_clicked',
    'pwa_ios_instructions_viewed',
    'pwa_dismissed'
  ));