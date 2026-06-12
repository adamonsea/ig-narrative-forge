-- 1. Remove the overly-permissive public SELECT policy on visuals.
-- Scoped policies "Public read: visuals of public stories" (anon, authenticated)
-- and "Public read: visuals of published stories" (anon) already cover legitimate
-- public access to published-story visuals, so removing the blanket policy does not
-- break public reading while closing access to draft/private visuals.
DROP POLICY IF EXISTS "Visuals publicly readable" ON public.visuals;

-- 2. Add RLS policies on realtime.messages to restrict Realtime channel subscriptions.
-- The app only uses public postgres_changes channels named like:
--   topic-feed-realtime-<topicId>   (public reader feed)
--   multi-tenant-topic-changes-<topicId> (owner dashboard)
--   story-notifications-<topicId>   (owner/reader notifications)
-- These policies enforce topic ownership for private subscriptions while keeping
-- public feed channels readable by everyone.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- service_role and internal jobs: full access
CREATE POLICY "realtime service role full access"
ON realtime.messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public feed channels: readable by anyone (anon + authenticated)
CREATE POLICY "realtime public feed channels readable"
ON realtime.messages
AS PERMISSIVE
FOR SELECT
TO anon, authenticated
USING (
  realtime.topic() LIKE 'topic-feed-realtime-%'
  OR realtime.topic() LIKE 'story-notifications-%'
);

-- Owner-scoped channels: only the topic owner may subscribe
CREATE POLICY "realtime owner channels by topic ownership"
ON realtime.messages
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.topics t
    WHERE t.created_by = (select auth.uid())
      AND realtime.topic() LIKE '%' || t.id::text || '%'
  )
);
