-- Phase 1 Testing and Validation Setup

-- Function to create admin role for first user
CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is the first user in the system
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    -- Make the first user an admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);
  ELSE
    -- Regular users get default user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::app_role);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically assign roles to new users
DROP TRIGGER IF EXISTS auto_assign_user_role ON auth.users;
CREATE TRIGGER auto_assign_user_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_admin_role();

-- Insert sample content sources for testing
INSERT INTO public.content_sources (
  source_name, 
  feed_url, 
  credibility_score, 
  region, 
  content_type,
  canonical_domain,
  is_active,
  scrape_frequency_hours
) VALUES 
  ('BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', 95, 'UK', 'news', 'bbc.com', true, 6),
  ('Reuters', 'https://feeds.reuters.com/reuters/topNews', 90, 'Global', 'news', 'reuters.com', true, 4),
  ('Local News Example', 'https://example-local.com/feed.xml', 75, 'Local', 'news', 'example-local.com', true, 12)
ON CONFLICT DO NOTHING;

-- Insert sample articles for testing search and deduplication
INSERT INTO public.articles (
  title,
  body,
  author,
  source_url,
  region,
  category,
  tags,
  summary,
  published_at,
  content_checksum
) VALUES 
  (
    'Sample Local News Article',
    'This is a sample article body that demonstrates the content management system. It contains enough text to test word count and reading time calculations. The system should automatically calculate metadata for this article including word count, reading time, and search vectors.',
    'John Reporter',
    'https://example-local.com/sample-article-1',
    'Local',
    'politics',
    ARRAY['local', 'government', 'community'],
    'A sample article demonstrating the CMS functionality',
    now() - interval '1 hour',
    encode(sha256('sample-content-1'::bytea), 'hex')
  ),
  (
    'Breaking News Update',
    'This is another sample article with different content to test the search functionality. Users should be able to search for specific terms and find relevant articles. The full-text search should work across titles, body content, and author names.',
    'Jane Journalist',
    'https://example-local.com/breaking-news',
    'Local', 
    'breaking',
    ARRAY['urgent', 'breaking', 'news'],
    'Breaking news update for testing purposes',
    now() - interval '30 minutes',
    encode(sha256('sample-content-2'::bytea), 'hex')
  ),
  (
    'Community Event Coverage',
    'Local community events are important for keeping residents informed. This article covers a recent community gathering and serves as test data for the content management system. It demonstrates how local news can be processed and categorized.',
    'Bob Editor',
    'https://example-local.com/community-event',
    'Local',
    'community',
    ARRAY['community', 'events', 'local'],
    'Coverage of recent community events',
    now() - interval '2 hours',
    encode(sha256('sample-content-3'::bytea), 'hex')
  )
ON CONFLICT DO NOTHING;

-- Function to test RSS import functionality
CREATE OR REPLACE FUNCTION public.test_rss_import(
  p_source_name TEXT DEFAULT 'Test RSS Source'
)
RETURNS JSONB AS $$
DECLARE
  source_record RECORD;
  result JSONB;
BEGIN
  -- Create or get test source
  INSERT INTO public.content_sources (
    source_name,
    feed_url,
    credibility_score,
    region,
    content_type,
    canonical_domain,
    is_active
  ) VALUES (
    p_source_name,
    'https://feeds.bbci.co.uk/news/rss.xml',
    85,
    'Test',
    'news',
    'test.com',
    true
  )
  ON CONFLICT (source_name) DO UPDATE SET
    feed_url = EXCLUDED.feed_url,
    updated_at = now()
  RETURNING * INTO source_record;
  
  -- Return test source info
  result := jsonb_build_object(
    'success', true,
    'source_id', source_record.id,
    'source_name', source_record.source_name,
    'feed_url', source_record.feed_url,
    'message', 'Test source created successfully'
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate search functionality
CREATE OR REPLACE FUNCTION public.test_search_functionality(
  p_search_term TEXT DEFAULT 'sample'
)
RETURNS TABLE(
  article_id UUID,
  title TEXT,
  relevance_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title,
    ts_rank(a.search, plainto_tsquery('english', p_search_term)) as relevance_score
  FROM public.articles a
  WHERE a.search @@ plainto_tsquery('english', p_search_term)
  ORDER BY relevance_score DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to ensure proper access during testing
DROP POLICY IF EXISTS "Content sources viewable by authenticated" ON public.content_sources;
CREATE POLICY "Content sources viewable by authenticated"
ON public.content_sources FOR SELECT
USING (true);

-- Add index for better search performance
CREATE INDEX IF NOT EXISTS idx_articles_search ON public.articles USING gin(search);