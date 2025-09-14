-- Update events table to support API-sourced events with rich details
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS start_time TIME,
ADD COLUMN IF NOT EXISTS end_time TIME,
ADD COLUMN IF NOT EXISTS price TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS source_api TEXT DEFAULT 'ai_generated';

-- Drop and recreate the get_topic_events function with new return columns
DROP FUNCTION IF EXISTS public.get_topic_events(uuid);

CREATE OR REPLACE FUNCTION public.get_topic_events(topic_id_param uuid)
RETURNS TABLE(
  id uuid, 
  title text, 
  description text, 
  start_date date, 
  end_date date, 
  start_time time,
  end_time time,
  location text, 
  source_url text, 
  source_name text, 
  event_type text, 
  category text,
  price text,
  rank_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.description,
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.location,
    e.source_url,
    e.source_name,
    e.event_type,
    e.category,
    e.price,
    e.rank_position
  FROM events e
  WHERE e.topic_id = topic_id_param 
    AND e.status = 'published'
    AND e.start_date >= CURRENT_DATE
    AND e.start_date <= CURRENT_DATE + INTERVAL '7 days'  -- Show events in next week
  ORDER BY e.rank_position ASC, e.start_date ASC, e.start_time ASC NULLS LAST
  LIMIT 10;
END;
$$;