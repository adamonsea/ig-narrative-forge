

# Replace Demo Sources with Topic-Appropriate, Fully Functional Sources

## Problem
The demo currently shows the same 3 Eastbourne local news sources (Sussex Express, Bournefree, The Argus) for all 4 topic categories. When a user picks "Culture & Arts" or "Environment", seeing local Sussex papers is confusing and undermines credibility.

## Solution
Create 3 new dedicated topics in the database with real, tested RSS sources for each category. Keep "Local News" using the existing Eastbourne sources. Update the demo config and components to serve per-topic source lists and per-topic feed previews.

## New Topics and Sources

### Local News (existing -- no changes)
Uses existing Eastbourne topic (`d224e606-...`):
- Sussex Express (sussexexpress.co.uk) -- 6,463 articles, 100% success
- Bournefree Live (bournefreelive.co.uk) -- 2,680 articles, 100% success
- The Argus (theargus.co.uk) -- 552 articles, 100% success

### Culture and Arts (new topic)
Sources with known RSS feeds:
- **BBC Culture** -- `http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml` -- Major, reliable RSS feed
- **The Arts Desk** -- `https://theartsdesk.com/rss.xml` -- Independent UK arts review site with RSS
- **The Guardian Culture** -- `https://www.theguardian.com/uk/culture/rss` -- Guardian section RSS

### Environment (new topic)
Sources with known RSS feeds:
- **BBC Science and Environment** -- `http://feeds.bbci.co.uk/news/science_and_environment/rss.xml` -- Reliable BBC RSS
- **Carbon Brief** -- `https://www.carbonbrief.org/feed` -- Leading UK climate journalism
- **The Guardian Environment** -- `https://www.theguardian.com/uk/environment/rss` -- Guardian section RSS

### Community (new topic)
Sources with known RSS feeds:
- **Third Sector** -- `https://www.thirdsector.co.uk/rss` -- UK charity/community sector news
- **Civil Society News** -- `https://www.civilsociety.co.uk/rss` -- Charity and non-profit news
- **The Guardian Society** -- `https://www.theguardian.com/society/rss` -- Social affairs and community

## Implementation Steps

### Step 1: Create new topics in the database
Create 3 new topic records via the migration tool:
- `culture-and-arts` (keyword type, created by the admin user)
- `environment` (keyword type)
- `community` (keyword type)

Mark them as `is_active = true` and set `is_demo_topic = true` (or use a naming convention) to distinguish them.

### Step 2: Add content sources for each new topic
Insert 9 new `content_sources` records (3 per topic), each with:
- Correct `feed_url` (the RSS URLs above)
- Correct `topic_id` pointing to the new topic
- `is_active = true`, `scraping_method = 'rss_discovery'`
- Initial `credibility_score` of 80+

### Step 3: Test each source
Use the `universal-topic-scraper` edge function to run a test scrape for each new source. Verify articles are discovered and stored in `topic_articles`. Sources that fail will be swapped for alternatives.

### Step 4: Update `src/lib/demoConfig.ts`
Change from a flat `DEMO_SOURCES` array to a per-topic source map:

```text
DEMO_SOURCES_BY_TOPIC = {
  local: [Sussex Express, Bournefree, The Argus],
  culture: [BBC Culture, The Arts Desk, Guardian Culture],
  environment: [BBC Sci/Env, Carbon Brief, Guardian Environment],
  community: [Third Sector, Civil Society, Guardian Society]
}
```

Also map each topic category to its real topic ID:

```text
DEMO_TOPIC_MAP = {
  local: 'd224e606-...',
  culture: '<new-culture-topic-id>',
  environment: '<new-environment-topic-id>',
  community: '<new-community-topic-id>'
}
```

### Step 5: Update `DemoSourcePicker.tsx`
Instead of importing the flat `DEMO_SOURCES` list, accept the selected topic ID as a prop and look up sources from `DEMO_SOURCES_BY_TOPIC[topicId]`.

### Step 6: Update `DemoFlow.tsx`
Pass the selected topic's ID through to the source picker and feed preview. Resolve the real topic ID from `DEMO_TOPIC_MAP` based on the user's topic choice.

### Step 7: Update `DemoFeedPreview.tsx`
Filter the stories query by the actual selected topic's ID (via a join to `topic_articles` or by `publication_name` matching). This ensures Culture topics show culture stories, etc.

### Step 8: Initial content seeding
After sources are added and tested, trigger a scrape for each new topic to populate it with 10-20 initial stories. Then run `enhanced-content-generator` on 3-5 stories per topic to have published stories ready for the demo feed preview.

## Files to Create/Modify

| File | Change |
|------|--------|
| Database | 3 new topics + 9 new content_sources (via migration + insert) |
| `src/lib/demoConfig.ts` | Per-topic source map and topic ID map |
| `src/components/demo/DemoSourcePicker.tsx` | Accept topic ID, use per-topic sources |
| `src/components/demo/DemoFlow.tsx` | Pass resolved topic ID through flow |
| `src/components/demo/DemoFeedPreview.tsx` | Filter stories by selected topic |

## Risk Mitigation
- RSS feeds from BBC and Guardian are extremely stable and well-maintained
- If any source fails testing, swap for an alternative from the same category
- Each topic gets 3 sources, so even if one underperforms the demo still works
- Fallback: if a new topic has no published stories yet, show a "generating your first stories" message and trigger generation

## Testing Strategy
1. Add sources to DB
2. Test each via `universal-topic-scraper` with `testMode: true`
3. Verify articles appear in `topic_articles`
4. Run content generation on a few articles per topic
5. Verify the demo flow end-to-end shows correct sources per topic choice

