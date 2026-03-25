

## Diagnosis: Negative Keywords Gap in Automation

### What's Working
Negative keywords ARE checked during:
- **Scraping** (`topic-aware-scraper`) -- rejects articles at ingestion
- **URL discovery** (`daily-content-monitor`) -- blocks URLs before fetching
- **Scoring** (`hybrid-content-scoring`) -- assigns -100 score
- **Pipeline cleanup** (`pipeline-cleanup`) -- retroactive manual cleanup

### What's NOT Working
The **automation pipeline** (`auto-simplify-queue` and `queue-processor`) has **zero negative keyword checks**. This means:
1. Articles that passed scraping before a negative keyword was added will get auto-processed
2. Articles that slipped through scraping will get queued and turned into stories automatically

### The Fix

**Edit `supabase/functions/auto-simplify-queue/index.ts`**:
1. Fetch `negative_keywords` alongside topic defaults (already querying `topics` table at line 121-123, just add `negative_keywords` to the select)
2. Before queuing each article (around line 165), fetch the article's title and body from `shared_article_content` via `shared_content_id`, and check against negative keywords
3. If a match is found, mark the article as `discarded` and skip it -- same pattern used by `pipeline-cleanup`

### Scope
- **1 file changed**: `supabase/functions/auto-simplify-queue/index.ts`
- Add negative keyword check in the article processing loop
- Log discarded articles for visibility
- No UI changes needed -- the existing TopicNegativeKeywords component already saves keywords to the `topics` table

