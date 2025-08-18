-- Add superadmin role and assign it to adamonsea@gmail.com

-- Add superadmin to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- Update the user to superadmin role
UPDATE public.user_roles 
SET role = 'superadmin'::app_role, updated_at = now()
WHERE user_id = 'c8284651-7ca9-407d-99ac-85c19cbe212c';

-- Update the has_role function to handle superadmin (superadmin has all permissions)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = _user_id 
      AND (role = _role OR role = 'superadmin'::app_role)
  );
$$;

-- Update get_current_user_role function to handle superadmin
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = auth.uid() 
  ORDER BY created_at DESC 
  LIMIT 1;
$$;

-- Add superadmin policies for complete access
CREATE POLICY "Superadmins can manage everything"
ON public.user_roles FOR ALL
USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Verify the role assignment
SELECT user_id, role, created_at, updated_at 
FROM public.user_roles 
WHERE user_id = 'c8284651-7ca9-407d-99ac-85c19cbe212c';