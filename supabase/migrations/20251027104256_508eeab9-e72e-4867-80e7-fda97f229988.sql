-- Reset vote context to allow re-backfill with DeepSeek
UPDATE parliamentary_mentions 
SET vote_context = NULL, 
    local_impact_summary = NULL 
WHERE vote_context IS NOT NULL;