-- Fix trigger to be BEFORE INSERT so we can modify the article
DROP TRIGGER IF EXISTS auto_duplicate_detection ON articles;
CREATE TRIGGER auto_duplicate_detection
  BEFORE INSERT ON articles
  FOR EACH ROW
  EXECUTE FUNCTION handle_article_duplicates();