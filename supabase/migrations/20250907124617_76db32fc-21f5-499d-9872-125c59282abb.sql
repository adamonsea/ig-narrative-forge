-- Enhanced URL normalization function
CREATE OR REPLACE FUNCTION public.normalize_url(input_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_url text;
BEGIN
  -- Return null if input is null or empty
  IF input_url IS NULL OR trim(input_url) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Start with the input URL
  normalized_url := lower(trim(input_url));
  
  -- Remove protocol
  normalized_url := regexp_replace(normalized_url, '^https?://', '', 'i');
  
  -- Remove www prefix
  normalized_url := regexp_replace(normalized_url, '^www\.', '', 'i');
  
  -- Remove trailing slash
  normalized_url := regexp_replace(normalized_url, '/$', '');
  
  -- Remove common query parameters that don't affect content
  normalized_url := regexp_replace(normalized_url, '[?&](utm_[^&]*|fbclid=[^&]*|gclid=[^&]*|ref=[^&]*|source=[^&]*)', '', 'g');
  
  -- Clean up any remaining ? or & at the end
  normalized_url := regexp_replace(normalized_url, '[?&]$', '');
  
  -- Remove fragment identifiers
  normalized_url := regexp_replace(normalized_url, '#.*$', '');
  
  RETURN normalized_url;
END;
$$;

-- Improved duplicate detection function with better filtering
CREATE OR REPLACE FUNCTION public.detect_article_duplicates(p_article_id uuid)
RETURNS TABLE(duplicate_id uuid, similarity_score numeric, detection_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  article_url text;
  article_title text;
  article_checksum text;
BEGIN
  -- Get the article details
  SELECT source_url, title, content_checksum
  INTO article_url, article_title, article_checksum
  FROM articles 
  WHERE id = p_article_id;
  
  IF article_url IS NULL THEN
    RETURN;
  END IF;
  
  -- Find exact URL duplicates (highest priority) - exclude processed articles
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    1.0::NUMERIC as similarity_score,
    'exact_url'::TEXT as detection_method
  FROM articles a
  WHERE a.id != p_article_id
    AND a.processing_status NOT IN ('processed', 'published', 'merged', 'discarded')
    AND normalize_url(a.source_url) = normalize_url(article_url);
  
  -- Find content checksum duplicates (if available)
  IF article_checksum IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      a.id as duplicate_id,
      1.0::NUMERIC as similarity_score,
      'content_checksum'::TEXT as detection_method
    FROM articles a
    WHERE a.id != p_article_id
      AND a.processing_status NOT IN ('processed', 'published', 'merged', 'discarded')
      AND a.content_checksum = article_checksum
      AND a.content_checksum IS NOT NULL;
  END IF;
  
  -- Find title duplicates with higher threshold (75%) - exclude processed articles
  IF article_title IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      a.id as duplicate_id,
      similarity(
        regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
        regexp_replace(lower(trim(article_title)), '[^\w\s]', '', 'g')
      )::NUMERIC as similarity_score,
      'title_similarity'::TEXT as detection_method
    FROM articles a
    WHERE a.id != p_article_id
      AND a.processing_status NOT IN ('processed', 'published', 'merged', 'discarded')
      AND a.title IS NOT NULL
      AND similarity(
        regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
        regexp_replace(lower(trim(article_title)), '[^\w\s]', '', 'g')
      ) >= 0.75
    ORDER BY similarity_score DESC;
  END IF;
END;
$$;

-- Enhanced duplicate handling trigger with automatic prevention
CREATE OR REPLACE FUNCTION public.handle_article_duplicates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  duplicate_count INTEGER;
  exact_duplicate_id UUID;
BEGIN
  -- Only check for duplicates on new articles
  IF NEW.processing_status = 'new' THEN
    
    -- First check for exact URL duplicates
    SELECT id INTO exact_duplicate_id
    FROM articles
    WHERE id != NEW.id
      AND processing_status NOT IN ('discarded', 'merged')
      AND normalize_url(source_url) = normalize_url(NEW.source_url)
    LIMIT 1;
    
    -- If exact duplicate exists, prevent insertion
    IF exact_duplicate_id IS NOT NULL THEN
      -- Update the existing article's timestamp to mark it as recently seen
      UPDATE articles 
      SET updated_at = now(),
          import_metadata = COALESCE(import_metadata, '{}')::jsonb || 
            jsonb_build_object(
              'duplicate_prevented', true,
              'original_duplicate_id', NEW.id,
              'prevented_at', now()
            )
      WHERE id = exact_duplicate_id;
      
      -- Log the prevention
      INSERT INTO system_logs (level, message, context, function_name)
      VALUES (
        'info',
        'Duplicate article insertion prevented',
        jsonb_build_object(
          'prevented_article_id', NEW.id,
          'existing_article_id', exact_duplicate_id,
          'url', NEW.source_url,
          'title', NEW.title
        ),
        'handle_article_duplicates'
      );
      
      -- Prevent insertion by raising an exception that the scraper can handle
      RAISE EXCEPTION 'DUPLICATE_ARTICLE_PREVENTED: %', exact_duplicate_id;
    END IF;
    
    -- Check for other types of duplicates for manual review
    SELECT COUNT(*) INTO duplicate_count
    FROM detect_article_duplicates(NEW.id);
    
    -- If duplicates found, mark for review (but allow insertion)
    IF duplicate_count > 0 THEN
      -- Insert into duplicate detection queue for manual review
      INSERT INTO article_duplicates_pending (
        original_article_id,
        duplicate_article_id,
        similarity_score,
        detection_method
      )
      SELECT 
        NEW.id,
        duplicate_id,
        similarity_score,
        detection_method
      FROM detect_article_duplicates(NEW.id)
      ON CONFLICT DO NOTHING;
      
      -- Mark article for duplicate review
      NEW.processing_status := 'duplicate_pending';
      NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
        jsonb_build_object(
          'duplicates_found', duplicate_count,
          'duplicate_check_completed', true,
          'checked_at', now()
        );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to clean up existing duplicates
CREATE OR REPLACE FUNCTION public.cleanup_duplicate_articles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  processed_count INTEGER := 0;
  merged_count INTEGER := 0;
  deleted_count INTEGER := 0;
  duplicate_record RECORD;
  article_record RECORD;
BEGIN
  -- Process exact URL duplicates first
  FOR duplicate_record IN 
    SELECT 
      a1.id as keep_id,
      a2.id as remove_id,
      a1.created_at as keep_created,
      a2.created_at as remove_created
    FROM articles a1
    JOIN articles a2 ON (
      normalize_url(a1.source_url) = normalize_url(a2.source_url)
      AND a1.id < a2.id  -- Keep the first one by ID
      AND a1.processing_status NOT IN ('discarded', 'merged')
      AND a2.processing_status NOT IN ('discarded', 'merged', 'processed')
    )
    LIMIT 100  -- Process in batches
  LOOP
    -- Keep the newer article, discard the older duplicate
    IF duplicate_record.keep_created < duplicate_record.remove_created THEN
      -- Update the newer article to have content from both if needed
      UPDATE articles 
      SET processing_status = 'discarded',
          import_metadata = COALESCE(import_metadata, '{}')::jsonb || 
            jsonb_build_object(
              'merged_with', duplicate_record.keep_id,
              'cleanup_reason', 'duplicate_url',
              'cleaned_at', now()
            )
      WHERE id = duplicate_record.remove_id;
    ELSE
      -- Keep the older article, discard the newer duplicate
      UPDATE articles 
      SET processing_status = 'discarded',
          import_metadata = COALESCE(import_metadata, '{}')::jsonb || 
            jsonb_build_object(
              'merged_with', duplicate_record.remove_id,
              'cleanup_reason', 'duplicate_url',
              'cleaned_at', now()
            )
      WHERE id = duplicate_record.keep_id;
    END IF;
    
    deleted_count := deleted_count + 1;
    processed_count := processed_count + 1;
    
    -- Log the merge
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info',
      'Duplicate articles cleaned up',
      jsonb_build_object(
        'kept_article_id', duplicate_record.keep_id,
        'removed_article_id', duplicate_record.remove_id,
        'cleanup_type', 'exact_url_duplicate'
      ),
      'cleanup_duplicate_articles'
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed_count', processed_count,
    'deleted_count', deleted_count,
    'merged_count', merged_count
  );
END;
$$;