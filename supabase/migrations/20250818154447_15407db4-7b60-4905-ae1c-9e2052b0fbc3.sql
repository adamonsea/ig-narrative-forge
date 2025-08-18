-- Assign superadmin role to adamonsea@gmail.com and update functions

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

-- Update ensure_admin_role function to make first user superadmin
CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is the first user in the system
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    -- Make the first user a superadmin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'superadmin'::app_role)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    -- Regular users get default user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::app_role)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to assign user role: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the role assignment
SELECT user_id, role, created_at, updated_at 
FROM public.user_roles 
WHERE user_id = 'c8284651-7ca9-407d-99ac-85c19cbe212c';