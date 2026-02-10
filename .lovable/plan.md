

## Fix: DemoFeedPreview stuck on "Generating stories..."

### Root cause
The `DemoFeedPreview` component uses a two-step query:
1. Fetch ALL `topic_articles` IDs for a topic (Eastbourne alone has ~3,000)
2. Pass all those IDs into `.in('topic_article_id', taIds)` on the `stories` table

This creates a massive query that silently fails or times out, resulting in zero stories and the permanent "Generating stories..." message.

### Fix
Replace the two-step query with a single query using the same join pattern used elsewhere in the codebase:

```sql
-- Instead of fetching 3000 IDs and using IN(...)
-- Use a direct join:
stories.select('..., topic_articles!inner(topic_id)')
  .eq('status', 'published')
  .eq('topic_articles.topic_id', topicId)
  .order('created_at', { ascending: false })
  .limit(8)
```

### File change

**`src/components/demo/DemoFeedPreview.tsx`**
- Remove the first query that fetches all `topic_articles` IDs
- Replace the second query with a single joined query: `.select('id, title, cover_illustration_url, created_at, publication_name, slides(id), topic_articles!inner(topic_id)').eq('status', 'published').eq('topic_articles.topic_id', topicId)`
- Remove the `taIds` variable and early return
- Keep all existing filtering logic (slides > 0, cover image required)

This is a single-file, query-only change with zero risk to other components.
