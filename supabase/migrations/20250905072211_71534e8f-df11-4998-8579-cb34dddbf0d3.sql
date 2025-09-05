-- Fix the function search path security issue
-- This addresses the security linter warning about mutable search path

-- Create or replace functions with proper search_path set to public
CREATE OR REPLACE FUNCTION public.update_error_tickets_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_content_sources_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::INTEGER 
  FROM content_sources 
  WHERE is_active = true;
$$;

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

CREATE OR REPLACE FUNCTION public.user_has_topic_access(p_topic_id uuid, p_required_role text DEFAULT 'viewer'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.topic_memberships tm
    JOIN public.topics t ON t.id = tm.topic_id
    WHERE tm.topic_id = p_topic_id 
    AND (
      tm.user_id = auth.uid() 
      OR t.created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
    )
    AND (
      p_required_role = 'viewer' OR
      (p_required_role = 'editor' AND tm.role IN ('owner', 'editor')) OR
      (p_required_role = 'owner' AND tm.role = 'owner') OR
      t.created_by = auth.uid() OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );
$$;

-- Update slide word count function
CREATE OR REPLACE FUNCTION public.update_slide_word_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  NEW.word_count := CASE
    WHEN NEW.content IS NULL THEN 0
    ELSE COALESCE(array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1), 0)
  END;
  RETURN NEW;
END;
$$;

-- Update article metadata function
CREATE OR REPLACE FUNCTION public.update_article_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  -- Calculate word count
  NEW.word_count := CASE
    WHEN NEW.body IS NULL THEN 0
    ELSE COALESCE(array_length(regexp_split_to_array(trim(NEW.body), '\s+'), 1), 0)
  END;
  
  -- Calculate reading time (assuming 200 words per minute)
  NEW.reading_time_minutes := GREATEST(1, ROUND(NEW.word_count / 200.0));
  
  RETURN NEW;
END;
$$;

-- Update articles search tsv function
CREATE OR REPLACE FUNCTION public.articles_search_tsv()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')),  'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body ,'')),  'B') ||
    setweight(to_tsvector('english', coalesce(NEW.author,'')), 'C');
  RETURN NEW;
END;
$$;