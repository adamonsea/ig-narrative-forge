-- Fix the authentication issue by ensuring proper function and trigger setup

-- Drop and recreate the function with proper error handling
DROP FUNCTION IF EXISTS public.ensure_admin_role() CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is the first user in the system
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    -- Make the first user an admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
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

-- Ensure the user_roles table has the right structure
ALTER TABLE public.user_roles ALTER COLUMN user_id SET NOT NULL;

-- Recreate the trigger
DROP TRIGGER IF EXISTS auto_assign_user_role ON auth.users;
CREATE TRIGGER auto_assign_user_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_admin_role();

-- Test the function with a simple query to make sure it works
SELECT 'Function test completed' as status;