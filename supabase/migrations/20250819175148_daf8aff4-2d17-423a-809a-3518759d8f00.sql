-- Update the queue processing cron job to run every minute instead of every 5 minutes
SELECT cron.alter_job(
  job_name := 'process-content-generation-queue',
  schedule := '* * * * *'  -- Every minute instead of every 5 minutes
);