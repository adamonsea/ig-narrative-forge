-- Clean up any orphaned carousel exports that may be causing issues
DELETE FROM carousel_exports WHERE status = 'generating' AND created_at < now() - interval '1 hour';

-- Update any partial carousel exports to failed status if they're older than 30 minutes
UPDATE carousel_exports 
SET status = 'failed', 
    error_message = 'Generation timeout - cleaned up by system'
WHERE status IN ('generating', 'partial') 
  AND created_at < now() - interval '30 minutes';