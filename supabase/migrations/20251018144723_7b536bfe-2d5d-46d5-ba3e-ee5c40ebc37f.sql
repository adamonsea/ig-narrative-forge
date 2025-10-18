-- Make stories.article_id nullable to support multi-tenant stories
ALTER TABLE stories ALTER COLUMN article_id DROP NOT NULL;

-- Add safety CHECK constraint to ensure at least one of article_id or topic_article_id is present
ALTER TABLE stories ADD CONSTRAINT stories_article_or_topic_article 
  CHECK (article_id IS NOT NULL OR topic_article_id IS NOT NULL);