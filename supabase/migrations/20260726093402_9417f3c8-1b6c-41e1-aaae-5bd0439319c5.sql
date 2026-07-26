
-- 1) topic_newsletter_signups: allow anon/authenticated to SELECT non-sensitive columns
GRANT SELECT (id, topic_id, is_active, created_at) ON public.topic_newsletter_signups TO anon, authenticated;

DROP POLICY IF EXISTS "Public can check signup existence" ON public.topic_newsletter_signups;
CREATE POLICY "Public can check signup existence"
  ON public.topic_newsletter_signups
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- 2) feed_visits: allow anonymous upserts to succeed (INSERT already exists; add UPDATE)
DROP POLICY IF EXISTS "Anyone can update their visit counter" ON public.feed_visits;
CREATE POLICY "Anyone can update their visit counter"
  ON public.feed_visits
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3) engagement stats RPC needs anon EXECUTE for public feed
GRANT EXECUTE ON FUNCTION public.get_topic_engagement_stats(uuid) TO anon;
