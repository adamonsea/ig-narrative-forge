-- Phase 1: Make email optional and add notification_type field

-- Make email optional for anonymous push subscriptions
ALTER TABLE topic_newsletter_signups 
ALTER COLUMN email DROP NOT NULL;

-- Add notification_type field with constraint
ALTER TABLE topic_newsletter_signups 
ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'instant' 
CHECK (notification_type IN ('instant', 'daily', 'weekly'));

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_newsletter_signups_notification_type 
ON topic_newsletter_signups(notification_type, is_active);

-- Add comment for documentation
COMMENT ON COLUMN topic_newsletter_signups.notification_type IS 
'Notification frequency preference: instant (as published), daily (6 PM summary), weekly (Friday 10 AM roundup)';