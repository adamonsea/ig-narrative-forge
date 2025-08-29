-- Enable realtime for the tables we need to monitor
ALTER TABLE content_generation_queue REPLICA IDENTITY FULL;
ALTER TABLE stories REPLICA IDENTITY FULL;
ALTER TABLE articles REPLICA IDENTITY FULL;

-- Add tables to realtime publication
BEGIN;
  -- Remove tables if they exist in the publication already
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS content_generation_queue;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS stories;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS articles;
  
  -- Add tables to realtime publication
  ALTER PUBLICATION supabase_realtime ADD TABLE content_generation_queue;
  ALTER PUBLICATION supabase_realtime ADD TABLE stories;  
  ALTER PUBLICATION supabase_realtime ADD TABLE articles;
COMMIT;