ALTER TABLE public.topic_insight_settings
  ADD COLUMN IF NOT EXISTS parliamentary_cards_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS events_cards_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.topics ALTER COLUMN automated_insights_enabled SET DEFAULT false;
ALTER TABLE public.topic_sentiment_settings ALTER COLUMN enabled SET DEFAULT false;

-- Public feed may only learn whether sentiment cards are switched on (no keyword data exposed)
CREATE OR REPLACE FUNCTION public.get_feed_sentiment_cards_enabled(_topic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT s.enabled AND (s.keyword_cards_enabled OR s.comparison_cards_enabled)
    FROM topic_sentiment_settings s
    JOIN topics t ON t.id = s.topic_id
    WHERE s.topic_id = _topic_id AND t.is_public AND t.is_active
    LIMIT 1
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.get_feed_sentiment_cards_enabled(uuid) TO anon, authenticated, service_role;