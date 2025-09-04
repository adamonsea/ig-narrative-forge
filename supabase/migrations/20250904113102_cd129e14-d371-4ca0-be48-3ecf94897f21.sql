-- Fix the infinite recursion by dropping all problematic policies and recreating them properly
DROP POLICY IF EXISTS "Articles public read for feeds" ON public.articles;
DROP POLICY IF EXISTS "Articles readable for published stories" ON public.articles;

-- Create a simple public read policy that doesn't cause recursion
CREATE POLICY "Articles public access"
ON public.articles
FOR SELECT
USING (
  -- Allow public read access (no authentication required)
  -- This enables public feeds to work
  true
);