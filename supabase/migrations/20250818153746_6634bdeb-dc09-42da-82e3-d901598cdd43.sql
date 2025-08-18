-- Fix authentication error by creating missing app_role enum type

-- Create the app_role enum type that was missing
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'moderator');

-- Ensure the user_roles table exists with proper structure
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'user'::app_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Update the ensure_admin_role function to handle the enum properly
CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is the first user in the system
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    -- Make the first user an admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);
  ELSE
    -- Regular users get default user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::app_role);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it's working with the updated function
DROP TRIGGER IF EXISTS auto_assign_user_role ON auth.users;
CREATE TRIGGER auto_assign_user_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_admin_role();