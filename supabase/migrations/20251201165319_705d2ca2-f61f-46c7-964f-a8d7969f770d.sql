-- Create new unique constraint that includes page_type to allow separate tracking of feed and play visits
CREATE UNIQUE INDEX idx_feed_visits_unique_daily_with_page_type 
ON feed_visits (topic_id, visitor_id, visit_date, page_type);