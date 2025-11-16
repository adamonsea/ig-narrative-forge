-- Add DELETE handling and perform one-time cleanup for orphan sentiment cards

-- 1) Replace function to handle both UPDATE (hidden/discarded) and DELETE operations
CREATE OR REPLACE FUNCTION cleanup_sentiment_cards_on_keyword_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- When a keyword is hidden or discarded, delete associated sentiment cards
    IF NEW.status IN ('hidden', 'discarded') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      DELETE FROM sentiment_cards 
      WHERE topic_id = NEW.topic_id 
        AND keyword_phrase = NEW.keyword_phrase;
      RAISE NOTICE 'Deleted sentiment cards for keyword on UPDATE: % (status changed to %)', NEW.keyword_phrase, NEW.status;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- When a keyword row is deleted, delete associated sentiment cards
    DELETE FROM sentiment_cards 
    WHERE topic_id = OLD.topic_id 
      AND keyword_phrase = OLD.keyword_phrase;
    RAISE NOTICE 'Deleted sentiment cards for keyword on DELETE: %', OLD.keyword_phrase;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2) Recreate triggers: one for UPDATE and one for DELETE
DROP TRIGGER IF EXISTS trigger_cleanup_sentiment_cards ON sentiment_keyword_tracking;
CREATE TRIGGER trigger_cleanup_sentiment_cards
  AFTER UPDATE ON sentiment_keyword_tracking
  FOR EACH ROW
  WHEN (NEW.status IN ('hidden', 'discarded'))
  EXECUTE FUNCTION cleanup_sentiment_cards_on_keyword_change();

DROP TRIGGER IF EXISTS trigger_cleanup_sentiment_cards_delete ON sentiment_keyword_tracking;
CREATE TRIGGER trigger_cleanup_sentiment_cards_delete
  AFTER DELETE ON sentiment_keyword_tracking
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_sentiment_cards_on_keyword_change();

-- 3) One-time backfill cleanup to remove any lingering cards that should not be visible
-- Remove cards tied to keywords that are hidden/discarded
DELETE FROM sentiment_cards sc
USING sentiment_keyword_tracking sk
WHERE sc.topic_id = sk.topic_id
  AND sc.keyword_phrase = sk.keyword_phrase
  AND sk.status IN ('hidden', 'discarded');

-- Remove orphan cards where no keyword exists anymore (e.g., after bulk delete)
DELETE FROM sentiment_cards sc
WHERE NOT EXISTS (
  SELECT 1 
  FROM sentiment_keyword_tracking sk
  WHERE sk.topic_id = sc.topic_id
    AND sk.keyword_phrase = sc.keyword_phrase
);
