
-- Culture and Arts sources
INSERT INTO public.content_sources (source_name, feed_url, topic_id, is_active, scraping_method, credibility_score, source_type, canonical_domain)
VALUES
  ('BBC Culture', 'http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', 'dbfbd79a-14fe-4c92-9da6-3376b74530f9', true, 'rss_discovery', 90, 'news', 'bbc.co.uk'),
  ('The Arts Desk', 'https://theartsdesk.com/rss.xml', 'dbfbd79a-14fe-4c92-9da6-3376b74530f9', true, 'rss_discovery', 80, 'news', 'theartsdesk.com'),
  ('The Guardian Culture', 'https://www.theguardian.com/uk/culture/rss', 'dbfbd79a-14fe-4c92-9da6-3376b74530f9', true, 'rss_discovery', 90, 'news', 'theguardian.com'),

-- Environment sources
  ('BBC Science and Environment', 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'b2e42a78-e1b2-416c-9885-c28bd1e5c95c', true, 'rss_discovery', 90, 'news', 'bbc.co.uk'),
  ('Carbon Brief', 'https://www.carbonbrief.org/feed', 'b2e42a78-e1b2-416c-9885-c28bd1e5c95c', true, 'rss_discovery', 85, 'news', 'carbonbrief.org'),
  ('The Guardian Environment', 'https://www.theguardian.com/uk/environment/rss', 'b2e42a78-e1b2-416c-9885-c28bd1e5c95c', true, 'rss_discovery', 90, 'news', 'theguardian.com'),

-- Community sources
  ('Third Sector', 'https://www.thirdsector.co.uk/rss', '643f3b98-4327-446f-b442-8185537e508c', true, 'rss_discovery', 80, 'news', 'thirdsector.co.uk'),
  ('Civil Society News', 'https://www.civilsociety.co.uk/rss', '643f3b98-4327-446f-b442-8185537e508c', true, 'rss_discovery', 80, 'news', 'civilsociety.co.uk'),
  ('The Guardian Society', 'https://www.theguardian.com/society/rss', '643f3b98-4327-446f-b442-8185537e508c', true, 'rss_discovery', 90, 'news', 'theguardian.com');
