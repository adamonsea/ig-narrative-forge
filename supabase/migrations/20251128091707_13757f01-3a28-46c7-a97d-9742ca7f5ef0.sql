-- Add plan column to waitlist table
ALTER TABLE public.waitlist 
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'general';