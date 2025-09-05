-- Fix remaining functions with search_path issues
-- Address the remaining security linter warnings about function search paths

-- Find and fix any remaining functions without proper search_path
-- These are likely the pg_trgm functions that need explicit search paths

CREATE OR REPLACE FUNCTION public.ensure_admin_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Check if this is the first user in the system
  IF NOT EXISTS (SELECT 1 FROM user_roles LIMIT 1) THEN
    -- Make the first user a superadmin
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'superadmin'::app_role)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    -- Regular users get default user role
    INSERT INTO user_roles (user_id, role)
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
$$;

-- Update the update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Update the auto_populate_content_queue function
CREATE OR REPLACE FUNCTION public.auto_populate_content_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Only add to queue if article is processed and has good quality scores
  IF NEW.processing_status = 'processed' AND 
     NEW.content_quality_score >= 50 AND 
     NEW.regional_relevance_score >= 5 THEN
    
    -- Check if there's already a pending or processing queue entry for this article
    IF NOT EXISTS (
      SELECT 1 FROM content_generation_queue 
      WHERE article_id = NEW.id 
      AND status IN ('pending', 'processing')
    ) THEN
      INSERT INTO content_generation_queue (
        article_id,
        slidetype,
        status,
        created_at
      ) VALUES (
        NEW.id,
        'tabloid',
        'pending',
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;