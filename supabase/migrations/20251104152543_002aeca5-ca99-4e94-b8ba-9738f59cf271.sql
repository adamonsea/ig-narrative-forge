-- Fix SQL ambiguity error in check_competing_regions_before_insert trigger
-- The variable name "competing_regions" conflicts with the column name

CREATE OR REPLACE FUNCTION check_competing_regions_before_insert()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  article_title TEXT;
  topic_region TEXT;
  topic_competing_list TEXT[];  -- ✅ Renamed to avoid ambiguity
  competing_region TEXT;
BEGIN
  -- Get article title and topic region info
  SELECT title INTO article_title 
  FROM shared_article_content 
  WHERE id = NEW.shared_content_id;
  
  SELECT region, competing_regions INTO topic_region, topic_competing_list
  FROM topics 
  WHERE id = NEW.topic_id;
  
  -- If no competing regions defined, allow the insert
  IF topic_competing_list IS NULL OR array_length(topic_competing_list, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if article title mentions any competing region
  FOREACH competing_region IN ARRAY topic_competing_list
  LOOP
    IF article_title ILIKE '%' || competing_region || '%' THEN
      RAISE EXCEPTION 'Article mentions competing region "%" and cannot be added to % topic', 
        competing_region, topic_region;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;