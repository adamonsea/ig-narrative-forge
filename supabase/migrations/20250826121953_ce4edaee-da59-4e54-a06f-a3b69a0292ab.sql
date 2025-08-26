-- Make stories, slides, and visuals publicly readable while keeping modification restricted
-- Update RLS policies to allow public read access

-- Stories table - allow public reading
DROP POLICY IF EXISTS "Stories viewable by region access" ON public.stories;
CREATE POLICY "Stories publicly readable" 
ON public.stories 
FOR SELECT 
USING (true);

-- Keep existing modification policies for stories
-- Stories manageable by region access policy remains unchanged

-- Slides table - allow public reading  
DROP POLICY IF EXISTS "Slides viewable by region access" ON public.slides;
CREATE POLICY "Slides publicly readable"
ON public.slides 
FOR SELECT 
USING (true);

-- Keep existing modification policies for slides
-- Slides manageable by region access policy remains unchanged

-- Visuals table - allow public reading
DROP POLICY IF EXISTS "Visuals viewable by region access" ON public.visuals;
CREATE POLICY "Visuals publicly readable"
ON public.visuals 
FOR SELECT 
USING (true);

-- Keep existing modification policies for visuals
-- Visuals manageable by region access policy remains unchanged