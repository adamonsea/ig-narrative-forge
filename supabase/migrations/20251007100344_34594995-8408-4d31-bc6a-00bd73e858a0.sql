-- Phase 1: Enhance parliamentary_mentions table for comprehensive voting tracker

-- Add new columns for enhanced voting data
ALTER TABLE parliamentary_mentions
ADD COLUMN IF NOT EXISTS party_whip_vote text,
ADD COLUMN IF NOT EXISTS is_rebellion boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS vote_category text,
ADD COLUMN IF NOT EXISTS national_relevance_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS local_impact_summary text,
ADD COLUMN IF NOT EXISTS vote_outcome text,
ADD COLUMN IF NOT EXISTS aye_count integer,
ADD COLUMN IF NOT EXISTS no_count integer,
ADD COLUMN IF NOT EXISTS is_weekly_roundup boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS week_start_date date;

-- Add index for performance on vote queries
CREATE INDEX IF NOT EXISTS idx_parliamentary_votes_date 
ON parliamentary_mentions(vote_date DESC) 
WHERE mention_type = 'vote';

-- Add index for weekly roundup queries
CREATE INDEX IF NOT EXISTS idx_parliamentary_weekly_roundups
ON parliamentary_mentions(topic_id, week_start_date DESC)
WHERE is_weekly_roundup = true;

-- Add index for rebellion tracking
CREATE INDEX IF NOT EXISTS idx_parliamentary_rebellions
ON parliamentary_mentions(topic_id, is_rebellion, vote_date DESC)
WHERE mention_type = 'vote' AND is_rebellion = true;

COMMENT ON COLUMN parliamentary_mentions.party_whip_vote IS 'The party''s official position: aye, no, or free_vote';
COMMENT ON COLUMN parliamentary_mentions.is_rebellion IS 'Whether MP voted against their party line';
COMMENT ON COLUMN parliamentary_mentions.vote_category IS 'Vote category: Housing, Transport, NHS, Education, etc.';
COMMENT ON COLUMN parliamentary_mentions.national_relevance_score IS 'How nationally significant this vote is (0-100)';
COMMENT ON COLUMN parliamentary_mentions.local_impact_summary IS 'Brief explanation of local impact';
COMMENT ON COLUMN parliamentary_mentions.vote_outcome IS 'Vote outcome: passed or rejected';
COMMENT ON COLUMN parliamentary_mentions.is_weekly_roundup IS 'Flag for weekly summary posts combining multiple votes';
COMMENT ON COLUMN parliamentary_mentions.week_start_date IS 'Monday date for weekly roundup stories';