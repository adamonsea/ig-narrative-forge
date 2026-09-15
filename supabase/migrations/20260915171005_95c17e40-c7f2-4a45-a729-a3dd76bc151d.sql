CREATE TABLE IF NOT EXISTS public.illustration_batch_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL,
  topic_id UUID,
  batch_id TEXT,
  custom_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  error TEXT,
  image_url TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.illustration_batch_jobs TO service_role;

ALTER TABLE public.illustration_batch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages illustration batch jobs"
ON public.illustration_batch_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_illustration_batch_jobs_status
  ON public.illustration_batch_jobs (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_illustration_batch_jobs_open_story
  ON public.illustration_batch_jobs (story_id)
  WHERE status IN ('submitted', 'in_progress');

CREATE TRIGGER update_illustration_batch_jobs_updated_at
BEFORE UPDATE ON public.illustration_batch_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS illustration_regen_count INTEGER NOT NULL DEFAULT 0;