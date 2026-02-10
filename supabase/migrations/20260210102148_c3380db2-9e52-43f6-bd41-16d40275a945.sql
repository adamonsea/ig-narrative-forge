
-- Create short_links table for native URL shortener
CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  target_url text NOT NULL,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup index on code
CREATE INDEX idx_short_links_code ON public.short_links (code);

-- Enable RLS
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- Public read (needed for redirect function)
CREATE POLICY "Anyone can read short links"
  ON public.short_links FOR SELECT
  USING (true);

-- Allow inserts from edge functions (anon role used by edge functions)
CREATE POLICY "Allow insert for short link creation"
  ON public.short_links FOR INSERT
  WITH CHECK (true);

-- Allow click_count updates
CREATE POLICY "Allow click count updates"
  ON public.short_links FOR UPDATE
  USING (true)
  WITH CHECK (true);
