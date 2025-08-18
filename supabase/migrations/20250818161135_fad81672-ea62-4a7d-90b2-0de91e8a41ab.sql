-- Phase 2: AI Content Generation - Tables only (skip existing policies)

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Stories viewable by authenticated users" ON public.stories;
DROP POLICY IF EXISTS "Stories manageable by authenticated users" ON public.stories;
DROP POLICY IF EXISTS "Slides viewable by authenticated users" ON public.slides; 
DROP POLICY IF EXISTS "Slides manageable by authenticated users" ON public.slides;
DROP POLICY IF EXISTS "Visuals viewable by authenticated users" ON public.visuals;
DROP POLICY IF EXISTS "Visuals manageable by authenticated users" ON public.visuals;
DROP POLICY IF EXISTS "Posts viewable by authenticated users" ON public.posts;
DROP POLICY IF EXISTS "Posts manageable by authenticated users" ON public.posts;

-- Now recreate the policies
CREATE POLICY "Stories viewable by authenticated users" ON public.stories FOR SELECT USING (true);
CREATE POLICY "Stories manageable by authenticated users" ON public.stories FOR ALL USING (true);
CREATE POLICY "Slides viewable by authenticated users" ON public.slides FOR SELECT USING (true);
CREATE POLICY "Slides manageable by authenticated users" ON public.slides FOR ALL USING (true);
CREATE POLICY "Visuals viewable by authenticated users" ON public.visuals FOR SELECT USING (true);
CREATE POLICY "Visuals manageable by authenticated users" ON public.visuals FOR ALL USING (true);
CREATE POLICY "Posts viewable by authenticated users" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Posts manageable by authenticated users" ON public.posts FOR ALL USING (true);