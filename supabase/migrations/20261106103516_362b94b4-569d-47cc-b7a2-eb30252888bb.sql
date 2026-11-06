CREATE TABLE public.film_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  milestone text NOT NULL CHECK (milestone IN ('started','halfway','finished')),
  referrer_host text,
  play_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visitor_id, milestone, play_date)
);
GRANT INSERT ON public.film_plays TO anon, authenticated;
GRANT ALL ON public.film_plays TO service_role;
ALTER TABLE public.film_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-out visitors can log plays" ON public.film_plays FOR INSERT TO anon
  WITH CHECK (length(visitor_id) BETWEEN 3 AND 64);

CREATE OR REPLACE FUNCTION public.get_site_stats(_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since date := current_date - greatest(_days,1) + 1; r jsonb;
BEGIN
  IF NOT (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'superadmin')) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'film_started', (SELECT count(DISTINCT visitor_id) FROM film_plays WHERE milestone='started' AND play_date>=since),
    'film_halfway', (SELECT count(DISTINCT visitor_id) FROM film_plays WHERE milestone='halfway' AND play_date>=since),
    'film_finished', (SELECT count(DISTINCT visitor_id) FROM film_plays WHERE milestone='finished' AND play_date>=since),
    'home_visitors', (SELECT count(DISTINCT visitor_id) FROM site_visits WHERE page_type='homepage' AND NOT is_internal AND visit_date>=since),
    'pricing_visitors', (SELECT count(DISTINCT visitor_id) FROM site_visits WHERE page_type='pricing' AND NOT is_internal AND visit_date>=since),
    'auth_visitors', (SELECT count(DISTINCT visitor_id) FROM site_visits WHERE page_type='auth' AND NOT is_internal AND visit_date>=since),
    'idea_leads', (SELECT count(*) FROM feed_leads WHERE created_at::date>=since),
    'idea_leads_email', (SELECT count(*) FROM feed_leads WHERE email IS NOT NULL AND created_at::date>=since),
    'new_feeds', (SELECT count(*) FROM topics WHERE created_at::date>=since),
    'top_referrers', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT split_part(split_part(referrer,'://',2),'/',1) AS host, count(DISTINCT visitor_id) AS visitors
        FROM site_visits WHERE page_type='homepage' AND NOT is_internal AND visit_date>=since AND referrer IS NOT NULL AND referrer NOT ILIKE '%curatr.pro%'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.get_site_stats(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_site_stats(int) TO authenticated;