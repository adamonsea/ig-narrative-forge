-- Configure tables for real-time updates
-- Set replica identity to FULL for complete row data during updates
ALTER TABLE content_generation_queue REPLICA IDENTITY FULL;
ALTER TABLE stories REPLICA IDENTITY FULL;
ALTER TABLE articles REPLICA IDENTITY FULL;

-- Add tables to realtime publication to activate real-time functionality
ALTER PUBLICATION supabase_realtime ADD TABLE content_generation_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE articles;