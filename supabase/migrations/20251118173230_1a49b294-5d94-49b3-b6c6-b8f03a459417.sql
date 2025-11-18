-- Fix security definer view by recreating with security_invoker
-- This makes the view respect RLS policies of the current user rather than the view creator
DROP VIEW IF EXISTS user_credits_summary;

CREATE VIEW user_credits_summary 
WITH (security_invoker = true) AS
SELECT 
  uc.user_id,
  uc.credits_balance,
  uc.total_credits_purchased,
  uc.total_credits_used,
  uc.updated_at,
  COUNT(ct.id) FILTER (WHERE ct.created_at > NOW() - INTERVAL '30 days') as transactions_last_30_days,
  SUM(ct.credits_amount) FILTER (WHERE ct.transaction_type = 'usage' AND ct.created_at > NOW() - INTERVAL '30 days') as usage_last_30_days
FROM user_credits uc
LEFT JOIN credit_transactions ct ON ct.user_id = uc.user_id
GROUP BY uc.user_id, uc.credits_balance, uc.total_credits_purchased, uc.total_credits_used, uc.updated_at;

COMMENT ON VIEW user_credits_summary IS 'Optimized view for credit balance lookups with 30-day usage stats (security_invoker respects RLS)';