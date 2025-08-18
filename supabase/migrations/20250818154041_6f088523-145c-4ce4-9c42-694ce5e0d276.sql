-- Fix the missing user role issue

-- Insert admin role for the current user since they're the first user
INSERT INTO public.user_roles (user_id, role)
VALUES ('c8284651-7ca9-407d-99ac-85c19cbe212c', 'admin'::app_role)
ON CONFLICT (user_id) DO UPDATE SET 
  role = EXCLUDED.role,
  updated_at = now();

-- Also ensure RLS policies allow users to see their own roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- And allow admins to see all roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));