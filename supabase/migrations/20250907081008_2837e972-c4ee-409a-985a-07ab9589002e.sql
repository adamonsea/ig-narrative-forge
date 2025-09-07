-- Add trigger to automatically detect duplicates on article insert
DROP TRIGGER IF EXISTS auto_duplicate_detection ON articles;
CREATE TRIGGER auto_duplicate_detection
  AFTER INSERT ON articles
  FOR EACH ROW
  EXECUTE FUNCTION handle_article_duplicates();