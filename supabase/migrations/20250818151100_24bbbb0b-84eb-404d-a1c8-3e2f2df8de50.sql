-- Fix critical security issues: Add admin role system and restrict sensitive table access

-- Create admin role enum  
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Create function to get current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = auth.uid() 
  ORDER BY created_at DESC 
  LIMIT 1;
$$;

-- User roles policies
CREATE POLICY "Users can view their own roles" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" 
ON public.user_roles 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- Update trigger for user_roles
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Fix system_logs RLS - restrict to service role and admins only
DROP POLICY IF EXISTS "System logs service role only" ON public.system_logs;

CREATE POLICY "System logs admin and service role access" 
ON public.system_logs 
FOR SELECT 
USING (
  auth.role() = 'service_role' OR 
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "System logs insert by service role" 
ON public.system_logs 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Fix api_usage RLS - admin only
DROP POLICY IF EXISTS "API usage authenticated read" ON public.api_usage;

CREATE POLICY "API usage admin read only" 
ON public.api_usage 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "API usage insert by service role" 
ON public.api_usage 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Fix job_runs RLS - admin only for sensitive operations
DROP POLICY IF EXISTS "Job runs authenticated access" ON public.job_runs;

CREATE POLICY "Job runs admin access" 
ON public.job_runs 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Job runs service role access" 
ON public.job_runs 
FOR ALL 
USING (auth.role() = 'service_role');

-- Fix content_sources RLS - admin only
DROP POLICY IF EXISTS "Content sources authenticated access" ON public.content_sources;

CREATE POLICY "Content sources admin access" 
ON public.content_sources 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- Add cost tracking and rate limiting tables
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  endpoint TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  window_duration INTERVAL NOT NULL DEFAULT '1 hour',
  max_requests INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rate limits admin access" 
ON public.rate_limits 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- Add request tracking for observability
CREATE TABLE public.request_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL,
  user_id UUID,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Request logs admin access" 
ON public.request_logs 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Request logs service role insert" 
ON public.request_logs 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_rate_limits_user_endpoint ON public.rate_limits(user_id, endpoint);
CREATE INDEX idx_request_logs_request_id ON public.request_logs(request_id);
CREATE INDEX idx_request_logs_created_at ON public.request_logs(created_at);

-- Insert initial admin user (will need to be updated with actual user ID)
-- This is a placeholder - the first user to sign up should be made admin manually