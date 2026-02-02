-- Backfill historical story lifecycle timestamps
-- Stories created before the lifecycle tracking feature was implemented have NULL timestamps

-- 1. Backfill simplified_at for stories that have slides but no timestamp
-- These were definitely simplified at some point, so use created_at as approximate timestamp
UPDATE stories
SET simplified_at = created_at
WHERE simplified_at IS NULL
AND id IN (SELECT DISTINCT story_id FROM slides WHERE story_id IS NOT NULL);

-- 2. Backfill illustration_generated_at for stories that have illustrations but no timestamp
-- Use created_at as the approximate time since we can't determine exact generation time
UPDATE stories
SET illustration_generated_at = created_at
WHERE illustration_generated_at IS NULL
AND cover_illustration_url IS NOT NULL;

-- 3. Backfill animation_generated_at for stories that have animations but no timestamp
UPDATE stories
SET animation_generated_at = created_at
WHERE animation_generated_at IS NULL
AND animated_illustration_url IS NOT NULL;

-- 4. Set is_auto_gathered to false for all historical stories (they were manual before automation existed)
UPDATE stories
SET is_auto_gathered = false
WHERE is_auto_gathered IS NULL;

-- 5. Set is_auto_simplified to false for all historical stories with slides (they were manual)
UPDATE stories
SET is_auto_simplified = false
WHERE is_auto_simplified IS NULL
AND id IN (SELECT DISTINCT story_id FROM slides WHERE story_id IS NOT NULL);

-- 6. Set is_auto_illustrated to false for all historical stories with illustrations (they were manual)
UPDATE stories
SET is_auto_illustrated = false
WHERE is_auto_illustrated IS NULL
AND cover_illustration_url IS NOT NULL;

-- 7. Set is_auto_animated to false for all historical stories with animations (they were manual)
UPDATE stories
SET is_auto_animated = false
WHERE is_auto_animated IS NULL
AND animated_illustration_url IS NOT NULL;