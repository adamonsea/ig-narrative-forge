-- Add negative keywords and competing regions to topics table
ALTER TABLE topics 
ADD COLUMN negative_keywords text[] DEFAULT '{}',
ADD COLUMN competing_regions text[] DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN topics.negative_keywords IS 'Keywords that should immediately disqualify content from this topic';
COMMENT ON COLUMN topics.competing_regions IS 'Regions/locations that compete with this topic and should reduce relevance scores';

-- Create index for better performance on negative keyword searches
CREATE INDEX idx_topics_negative_keywords ON topics USING GIN(negative_keywords);
CREATE INDEX idx_topics_competing_regions ON topics USING GIN(competing_regions);