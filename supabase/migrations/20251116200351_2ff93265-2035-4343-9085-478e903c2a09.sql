-- Create trigger to automatically delete sentiment cards when keywords are hidden or discarded
CREATE OR REPLACE FUNCTION cleanup_sentiment_cards_on_keyword_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When a keyword is hidden or discarded, delete associated sentiment cards
  IF NEW.status IN ('hidden', 'discarded') AND OLD.status NOT IN ('hidden', 'discarded') THEN
    DELETE FROM sentiment_cards 
    WHERE topic_id = NEW.topic_id 
    AND keyword_phrase = NEW.keyword_phrase;
    
    RAISE NOTICE 'Deleted sentiment cards for keyword: % (status changed to %)', NEW.keyword_phrase, NEW.status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on sentiment_keyword_tracking
DROP TRIGGER IF EXISTS trigger_cleanup_sentiment_cards ON sentiment_keyword_tracking;
CREATE TRIGGER trigger_cleanup_sentiment_cards
  AFTER UPDATE ON sentiment_keyword_tracking
  FOR EACH ROW
  WHEN (NEW.status IN ('hidden', 'discarded'))
  EXECUTE FUNCTION cleanup_sentiment_cards_on_keyword_change();