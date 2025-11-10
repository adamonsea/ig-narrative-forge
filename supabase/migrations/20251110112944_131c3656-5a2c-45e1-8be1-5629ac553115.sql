-- Enable real-time for topic pipeline tables
ALTER TABLE topic_articles REPLICA IDENTITY FULL;
ALTER TABLE slides REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE topic_articles;
ALTER PUBLICATION supabase_realtime ADD TABLE slides;