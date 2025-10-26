-- Backfill missing MP metadata in parliamentary stories
-- This fixes historical stories that have NULL mp_name or mp_party

UPDATE stories s
SET 
  mp_name = pm.mp_name,
  mp_party = pm.party
FROM parliamentary_mentions pm
WHERE pm.story_id = s.id
  AND s.is_parliamentary = true
  AND (s.mp_name IS NULL OR s.mp_party IS NULL);