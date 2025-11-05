-- Add snippet tracking fields to topic_articles
ALTER TABLE topic_articles 
ADD COLUMN IF NOT EXISTS is_snippet BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS snippet_reason TEXT;

-- Create index for efficient snippet filtering
CREATE INDEX IF NOT EXISTS idx_topic_articles_is_snippet ON topic_articles(is_snippet) WHERE is_snippet = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN topic_articles.is_snippet IS 'Indicates if the article content is a snippet (truncated from RSS) rather than full extracted content';
COMMENT ON COLUMN topic_articles.snippet_reason IS 'Reason code for why content is a snippet (e.g., rss_fallback_after_extraction_error, rss_description_truncated)';