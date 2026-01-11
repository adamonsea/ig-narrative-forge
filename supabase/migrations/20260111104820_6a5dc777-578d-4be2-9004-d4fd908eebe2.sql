-- Create site_visits table for platform-wide visitor tracking
CREATE TABLE public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  page_path text NOT NULL,
  page_type text NOT NULL, -- 'homepage', 'feed', 'story', 'play', 'pricing', 'auth', 'dashboard', 'other'
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  user_agent text,
  referrer text,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  
  -- Deduplicate: one visit per visitor per page per day
  UNIQUE(visitor_id, page_path, visit_date)
);

-- Enable RLS
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (visitor tracking from public pages)
CREATE POLICY "Anyone can insert site visits"
  ON public.site_visits FOR INSERT
  WITH CHECK (true);

-- Allow topic owners to read visits for their topics
CREATE POLICY "Topic owners can read their topic visits"
  ON public.site_visits FOR SELECT
  USING (
    topic_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM public.topics t 
      WHERE t.id = site_visits.topic_id 
      AND t.created_by = auth.uid()
    )
  );

-- Indexes for efficient queries
CREATE INDEX idx_site_visits_date ON public.site_visits(visit_date);
CREATE INDEX idx_site_visits_topic ON public.site_visits(topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX idx_site_visits_page_type ON public.site_visits(page_type);
CREATE INDEX idx_site_visits_visitor_date ON public.site_visits(visitor_id, visit_date);

-- Create function to get site-wide visitor stats for a user's topics
CREATE OR REPLACE FUNCTION public.get_site_visitor_stats(p_user_id uuid)
RETURNS TABLE (
  topic_id uuid,
  today_visitors bigint,
  week_visitors bigint,
  total_pageviews bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_week_start date := CURRENT_DATE - INTERVAL '6 days';
BEGIN
  RETURN QUERY
  SELECT 
    sv.topic_id,
    COUNT(DISTINCT sv.visitor_id) FILTER (WHERE sv.visit_date = v_today) as today_visitors,
    COUNT(DISTINCT sv.visitor_id) FILTER (WHERE sv.visit_date >= v_week_start) as week_visitors,
    COUNT(*) FILTER (WHERE sv.visit_date >= v_week_start) as total_pageviews
  FROM site_visits sv
  INNER JOIN topics t ON sv.topic_id = t.id
  WHERE t.created_by = p_user_id
    AND sv.page_type IN ('feed', 'story', 'play')
  GROUP BY sv.topic_id;
END;
$$;