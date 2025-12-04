-- Phase 1: Add RLS policy for public parliamentary mentions access without story_id dependency
CREATE POLICY "Public can view parliamentary votes for public topics"
ON public.parliamentary_mentions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM topics t 
    WHERE t.id = parliamentary_mentions.topic_id 
    AND t.is_active = true 
    AND t.is_public = true
    AND t.parliamentary_tracking_enabled = true
  )
);

-- Phase 2: Backfill is_major_vote based on criteria:
-- Rebellion, close vote (<10%), high national relevance (>75), or budget/NHS/Education with high turnout
UPDATE public.parliamentary_mentions
SET is_major_vote = true
WHERE 
  is_rebellion = true
  OR (aye_count + no_count > 0 AND ABS(aye_count - no_count)::float / (aye_count + no_count) < 0.1)
  OR national_relevance_score > 75
  OR (vote_category IN ('Economy', 'NHS', 'Education', 'Housing') AND (aye_count + no_count) > 400);