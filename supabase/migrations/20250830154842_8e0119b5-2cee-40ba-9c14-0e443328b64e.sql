-- Add status column to scraped_urls_history table to track processing outcomes
ALTER TABLE scraped_urls_history 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scraped';

-- Add index for better performance on status queries
CREATE INDEX IF NOT EXISTS idx_scraped_urls_status 
ON scraped_urls_history(url, status);

-- Add comment to clarify the status field
COMMENT ON COLUMN scraped_urls_history.status IS 'Processing outcome: scraped, stored, discarded, duplicate, manually_discarded';