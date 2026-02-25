

## Two Issues: Hidden Arrivals + Holiday Mode Not Self-Publishing

### Problem 1: "Hidden stories in arrivals" that become non-interactive

**Root cause:** The arrivals filter (line 228 of `useMultiTenantTopicPipeline.tsx`) includes articles with `processing_status` in both `'new'` AND `'processed'`:

```text
Arrivals shows:  processing_status IN ('new', 'processed')
                 AND NOT in published stories
                 AND NOT in active queue
```

When you "Simplify" an article, `auto-simplify-queue` marks it `processing_status = 'processed'` and inserts a queue item. While the queue item is `pending`/`processing`, the article is hidden. But once the queue item completes (status becomes `completed`), the article reappears in arrivals because the filter only excludes `pending`/`processing` queue items. It shows alongside its published story, creating a "ghost" card that has no meaningful action.

After you publish another story, the refresh triggers a reload, and these ghost articles may lose their interactive state or end up with stale references (the story exists but the card still renders as an "arrival").

**Fix:** Stop showing `'processed'` articles in arrivals. Only show `processing_status = 'new'`. Articles that have been successfully queued and processed should not reappear. Line 228 changes from:

```
['new', 'processed'].includes(item.processing_status)
```
to:
```
item.processing_status === 'new'
```

This is safe because:
- `auto-simplify-queue` marks articles `'processed'` when it queues them
- Manual "Simplify" also queues them
- Once processed, the story exists in Published — no reason to show the article again

---

### Problem 2: 100% rated story stuck in arrivals (not auto-published in holiday mode)

**Root cause chain — two blockers:**

1. **`auto-simplify-queue` only processes `processing_status = 'new'`** (line 71). If an article somehow got set to `'processed'` without a story being created (e.g. a failed queue run, or a previous story was deleted with the old `delete_story_cascade` that used to reset to `'new'` but the article got re-processed and re-marked), it's stuck. The 100% article you saw was likely already `'processed'` from a prior run.

2. **`auto-illustrate-stories` uses legacy join** (line 125): `articles!inner(topic_id)`. Multi-tenant stories link via `topic_article_id` → `topic_articles.topic_id`, not via `articles.topic_id`. So even if a story is created and ready, auto-illustration finds zero eligible stories.

3. **`publish-ready-stories`** checks for drip feed and scheduled times, which may hold stories in `ready` status without publishing them if no `scheduled_publish_at` is set and drip feed is enabled.

**Fixes:**

#### Fix A: `auto-illustrate-stories` — multi-tenant query path
Replace the legacy join query (lines 123-132):
```
.select('id, title, quality_score, created_at, article_id, articles!inner(topic_id)')
.in('articles.topic_id', topicIds)
```
With a dual-path query that also covers multi-tenant stories via `topic_articles`:
```
.select('id, title, quality_score, created_at, topic_article_id, topic_articles!inner(topic_id)')
.in('topic_articles.topic_id', topicIds)
```
Since almost all new stories are multi-tenant, the legacy path can be dropped or kept as a fallback with a union approach.

#### Fix B: Arrivals filter — only show `'new'`
As described above. Prevents ghost articles from appearing.

#### Fix C: Add resilience to `auto-simplify-queue`
Add a secondary check: if an article is `'processed'` but has NO story and NO active queue item, reset it to `'new'` so it gets re-queued. This handles edge cases where processing failed silently.

---

### Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useMultiTenantTopicPipeline.tsx` (line 228) | Filter arrivals to only `processing_status === 'new'` |
| `supabase/functions/auto-illustrate-stories/index.ts` (lines 123-132) | Replace `articles!inner(topic_id)` with `topic_articles!inner(topic_id)` for multi-tenant story discovery |
| `supabase/functions/auto-simplify-queue/index.ts` | Add orphan recovery: reset `'processed'` articles back to `'new'` if they have no story and no queue item |

These three changes together ensure:
- Arrivals only shows genuinely new, unprocessed articles
- Holiday mode auto-illustrates multi-tenant stories correctly
- Failed processing doesn't permanently orphan articles

