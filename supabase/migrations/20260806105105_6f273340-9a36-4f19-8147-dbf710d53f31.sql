ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_error text,
  ADD COLUMN IF NOT EXISTS last_digest_at timestamptz;