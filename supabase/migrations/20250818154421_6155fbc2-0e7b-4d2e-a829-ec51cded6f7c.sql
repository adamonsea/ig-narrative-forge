-- Add superadmin to the app_role enum (commit this first)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';