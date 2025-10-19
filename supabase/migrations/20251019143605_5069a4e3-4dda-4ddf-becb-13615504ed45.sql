-- Add is_major_vote column to parliamentary_mentions
ALTER TABLE parliamentary_mentions
ADD COLUMN IF NOT EXISTS is_major_vote BOOLEAN DEFAULT false;

-- Add index for efficient filtering by major votes
CREATE INDEX IF NOT EXISTS idx_parliamentary_mentions_major_votes 
ON parliamentary_mentions(topic_id, is_major_vote, vote_date DESC) 
WHERE is_major_vote = true;

-- Add comment for documentation
COMMENT ON COLUMN parliamentary_mentions.is_major_vote IS 'Flags votes that are particularly significant or noteworthy for the topic';
