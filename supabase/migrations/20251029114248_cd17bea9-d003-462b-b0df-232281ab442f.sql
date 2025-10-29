-- Phase 2 Items 4 & 6: Credit consolidation and safe index optimization

-- Item 4: Create optimized view for credit balance lookups
CREATE OR REPLACE VIEW user_credits_summary AS
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

COMMENT ON VIEW user_credits_summary IS 'Phase 2 Item 4: Optimized view for credit balance lookups with 30-day usage stats';

-- Item 6: Strategic index optimization (conservative approach)

-- Articles table indexes (verified columns only)
CREATE INDEX IF NOT EXISTS idx_articles_topic_status ON articles(topic_id, processing_status) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_source_created ON articles(source_id, created_at DESC) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_region_status ON articles(region, processing_status) WHERE region IS NOT NULL;

-- Stories table indexes (verified columns)
CREATE INDEX IF NOT EXISTS idx_stories_article_id ON stories(article_id);
CREATE INDEX IF NOT EXISTS idx_stories_status_created ON stories(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_is_published ON stories(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_topic_article ON stories(topic_article_id) WHERE topic_article_id IS NOT NULL;

-- Content sources indexes
CREATE INDEX IF NOT EXISTS idx_sources_topic_active ON content_sources(topic_id, is_active, last_scraped_at) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sources_region_active ON content_sources(region, is_active) WHERE region IS NOT NULL;

-- Credit transactions indexes (user dashboard performance)
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_date ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_story ON credit_transactions(related_story_id) WHERE related_story_id IS NOT NULL;

-- Topics table indexes (access control queries)
CREATE INDEX IF NOT EXISTS idx_topics_creator_active ON topics(created_by, is_active, is_public);

-- Parliamentary mentions indexes
CREATE INDEX IF NOT EXISTS idx_parliamentary_topic_date ON parliamentary_mentions(topic_id, vote_date DESC) WHERE vote_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parliamentary_story_id ON parliamentary_mentions(story_id) WHERE story_id IS NOT NULL;

-- Community pulse keywords indexes
CREATE INDEX IF NOT EXISTS idx_community_pulse_topic_date ON community_pulse_keywords(topic_id, analysis_date DESC, is_visible);

-- Documentation
COMMENT ON INDEX idx_articles_topic_status IS 'Phase 2 Item 6: Optimizes topic article pipeline queries';
COMMENT ON INDEX idx_credit_transactions_user_date IS 'Phase 2 Item 6: Optimizes user transaction history queries';
COMMENT ON INDEX idx_stories_is_published IS 'Phase 2 Item 6: Optimizes public feed queries';