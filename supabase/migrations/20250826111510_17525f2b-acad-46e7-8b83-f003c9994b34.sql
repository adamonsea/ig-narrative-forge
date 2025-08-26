-- Create user regions table for multi-tenant access control
CREATE TABLE public.user_regions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, region)
);

-- Enable RLS
ALTER TABLE public.user_regions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own region assignments
CREATE POLICY "Users can view their own regions" 
ON public.user_regions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Admins can manage all region assignments
CREATE POLICY "Admins can manage all regions" 
ON public.user_regions 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create helper function to check user region access
CREATE OR REPLACE FUNCTION public.user_has_region_access(check_region text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_regions 
    WHERE user_id = auth.uid() 
    AND region = check_region
  ) OR has_role(auth.uid(), 'admin'::app_role);
$$;

-- Assign existing user to all current regions to maintain functionality
INSERT INTO public.user_regions (user_id, region)
SELECT DISTINCT 
  u.id as user_id,
  a.region
FROM auth.users u
CROSS JOIN (
  SELECT DISTINCT region 
  FROM public.articles 
  WHERE region IS NOT NULL
) a
WHERE u.deleted_at IS NULL
ON CONFLICT (user_id, region) DO NOTHING;

-- Update articles RLS policies for region-based access
DROP POLICY IF EXISTS "Articles viewable by authenticated users" ON public.articles;
DROP POLICY IF EXISTS "Articles insert by authenticated" ON public.articles;
DROP POLICY IF EXISTS "Articles update by authenticated" ON public.articles;
DROP POLICY IF EXISTS "Articles delete by authenticated" ON public.articles;

-- New region-based policies
CREATE POLICY "Articles viewable by region access" 
ON public.articles 
FOR SELECT 
USING (
  -- Allow if user has region access or is admin
  user_has_region_access(region) OR 
  -- Allow articles without regions for now (will be addressed later)
  region IS NULL
);

CREATE POLICY "Articles manageable by authenticated users" 
ON public.articles 
FOR ALL 
USING (true);

-- Service role needs full access for scraping
CREATE POLICY "Articles service role access" 
ON public.articles 
FOR ALL 
USING (auth.role() = 'service_role');