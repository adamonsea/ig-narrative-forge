ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS follow_up_error text,
  ADD COLUMN IF NOT EXISTS follow_up_opted_out boolean NOT NULL DEFAULT false;