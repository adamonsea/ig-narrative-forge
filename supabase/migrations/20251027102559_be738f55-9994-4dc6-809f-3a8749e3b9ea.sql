-- Add bill context fields to parliamentary mentions
ALTER TABLE parliamentary_mentions 
ADD COLUMN IF NOT EXISTS bill_description text,
ADD COLUMN IF NOT EXISTS bill_stage text,
ADD COLUMN IF NOT EXISTS vote_context text;