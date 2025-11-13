-- Add workhorse keywords to Medical Device Development topic
UPDATE topics
SET 
  keywords = array_cat(
    keywords,
    ARRAY[
      'orthopedic implants',
      'cardiovascular devices',
      'surgical instruments',
      'diagnostic equipment',
      'prosthetic devices',
      'surgical technology',
      'patient monitoring',
      'imaging devices',
      'respiratory devices',
      'neurological devices',
      'dental devices',
      'ophthalmic devices',
      'wound care devices',
      'rehabilitation devices'
    ]::text[]
  ),
  updated_at = now()
WHERE slug = 'medical-device-development'
  AND NOT keywords @> ARRAY['orthopedic implants']::text[]; -- Only if not already added

-- Log the update
INSERT INTO system_logs (level, message, function_name, context)
VALUES (
  'info',
  'Added workhorse keywords to Medical Device Development topic',
  'add-workhorse-keywords-migration',
  jsonb_build_object(
    'topic_slug', 'medical-device-development',
    'keywords_added', 14,
    'reason', 'Fix stale sources by adding broader medical device terminology',
    'timestamp', now()
  )
);