-- Set eastbourne topic to public to fix feed access
UPDATE topics 
SET is_public = true, updated_at = now()
WHERE slug = 'eastbourne' AND is_active = true;