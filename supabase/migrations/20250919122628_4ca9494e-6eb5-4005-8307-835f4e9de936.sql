-- Re-process stories with poor content quality using proper DeepSeek pipeline
-- This fixes stories that were bulk-published without proper AI rewriting

-- First, identify stories with poor quality indicators (emojis, long unstructured text)
WITH poor_quality_stories AS (
  SELECT DISTINCT s.id
  FROM stories s
  JOIN slides sl ON sl.story_id = s.id  
  WHERE s.status = 'published' 
    AND s.is_published = true
    AND s.created_at >= CURRENT_DATE  -- Only today's bulk-published stories
    AND (
      -- Stories with emoji-heavy content
      sl.content ~ '[🎉🌟💪🔥⭐🏆🎯✨💯🚀🌈👏💖🎊🎈🌺🌸🎵🎶🎤🎭🎨🎪🎬🎮🎲🎰🃏🎳🎯🎪]' 
      OR 
      -- Stories with very long slides (indicates unprocessed content)
      length(sl.content) > 500
      OR
      -- Stories with numbered list format (indicates raw processing)
      sl.content ~ '^\s*[0-9]+\.\s'
    )
)
-- Reset poor quality stories back to draft for re-processing
UPDATE stories 
SET status = 'draft',
    is_published = false,
    updated_at = now()
WHERE id IN (SELECT id FROM poor_quality_stories);

-- Add these stories back to content generation queue for proper processing
INSERT INTO content_generation_queue (
  article_id,
  topic_article_id,  
  shared_content_id,
  slidetype,
  status,
  tone,
  writing_style,
  audience_expertise,
  ai_provider,
  created_at
)
SELECT 
  s.article_id,
  s.topic_article_id,
  s.shared_content_id,
  'tabloid' as slidetype,
  'pending' as status,
  'conversational' as tone,
  'journalistic' as writing_style,
  'intermediate' as audience_expertise, 
  'deepseek' as ai_provider,
  now() as created_at
FROM stories s
WHERE s.status = 'draft' 
  AND s.updated_at >= now() - INTERVAL '5 minutes'  -- Just updated stories
  AND NOT EXISTS (
    SELECT 1 FROM content_generation_queue cq 
    WHERE (cq.article_id = s.article_id OR cq.topic_article_id = s.topic_article_id)
    AND cq.status IN ('pending', 'processing')
  )
ON CONFLICT DO NOTHING;

-- Also ensure slides have proper data structure for feed rendering
UPDATE slides 
SET content = CASE 
  -- Fix overly long slide content
  WHEN length(content) > 400 THEN 
    substring(content from 1 for 350) || '...'
  ELSE content
END,
updated_at = now()
WHERE story_id IN (
  SELECT s.id FROM stories s 
  WHERE s.status = 'published' 
    AND s.is_published = true
    AND s.created_at >= CURRENT_DATE
)
AND length(content) > 400;