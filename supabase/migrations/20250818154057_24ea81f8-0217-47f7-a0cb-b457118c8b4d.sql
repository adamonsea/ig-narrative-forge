-- Fix the user role assignment issue

-- First, add a unique constraint on user_id if it doesn't exist
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

-- Insert admin role for the current user
INSERT INTO public.user_roles (user_id, role)
VALUES ('c8284651-7ca9-407d-99ac-85c19cbe212c', 'admin'::app_role);

-- Ensure RLS policies are correct
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;  
CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));