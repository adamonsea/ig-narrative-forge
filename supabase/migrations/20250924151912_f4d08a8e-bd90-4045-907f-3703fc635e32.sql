-- Create a public slides fetcher for published stories
CREATE OR REPLACE FUNCTION public.get_public_slides_for_stories(
  p_story_ids uuid[]
)
RETURNS TABLE(
  id uuid,
  story_id uuid,
  slide_number integer,
  content text,
  word_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    s.id,
    s.story_id,
    s.slide_number,
    s.content,
    COALESCE(s.word_count, 0) AS word_count
  FROM public.slides s
  WHERE s.story_id = ANY(p_story_ids)
    AND public.is_story_published(s.story_id) = true
  ORDER BY s.story_id, s.slide_number;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_slides_for_stories(p_story_ids uuid[]) TO anon, authenticated;