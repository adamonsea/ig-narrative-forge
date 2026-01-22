-- Fix feed_visits RLS policies with proper auth function wrapping
DROP POLICY IF EXISTS "Public can record visits" ON public.feed_visits;
DROP POLICY IF EXISTS "Service role can manage feed visits" ON public.feed_visits;

-- Allow anonymous/public inserts for tracking visits
CREATE POLICY "Anyone can record visits" 
ON public.feed_visits 
FOR INSERT 
WITH CHECK (true);

-- Service role management with optimized auth check
CREATE POLICY "Service role can manage feed visits" 
ON public.feed_visits 
FOR ALL 
USING ((SELECT auth.role()) = 'service_role');