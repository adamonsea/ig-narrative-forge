-- Add source_type field to content_sources table for better classification
ALTER TABLE content_sources 
ADD COLUMN source_type text DEFAULT 'national';

-- Update existing hyperlocal sources
UPDATE content_sources 
SET source_type = 'hyperlocal'
WHERE region = 'Eastbourne' 
   OR canonical_domain IN ('eastbournereporter.co.uk', 'bournefreelive.co.uk', 'eastbourne.news');

-- Update regional sources (East Sussex)
UPDATE content_sources 
SET source_type = 'regional'
WHERE region = 'East Sussex' 
   AND source_type = 'national';

-- Create index for faster lookups
CREATE INDEX idx_content_sources_type_region ON content_sources(source_type, region);