-- Drop the old unique index that doesn't include page_type
-- This is blocking play mode visit inserts when a user already has a feed visit that day
DROP INDEX IF EXISTS idx_feed_visits_unique_daily;

-- The new index with page_type already exists: idx_feed_visits_unique_daily_with_page_type
-- This allows separate tracking of feed vs play mode visits from the same visitor on the same day