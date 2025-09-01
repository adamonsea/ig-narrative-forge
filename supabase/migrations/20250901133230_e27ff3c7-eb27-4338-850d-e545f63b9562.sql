-- Remove the old duplicate policies that are less secure
DROP POLICY IF EXISTS "Stories manageable by region access" ON public.stories;
DROP POLICY IF EXISTS "Slides manageable by region access" ON public.slides;