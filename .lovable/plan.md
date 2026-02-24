

# Holiday Mode Automation -- Root Cause Analysis and Fix Plan

## Problem Summary

Holiday mode is supposed to run a 3-step pipeline: **Gather → Simplify → Illustrate**. Currently only step 1 (gathering) works. Steps 2 and 3 are broken due to three distinct blockers.

---

## Root Cause Analysis

### Blocker 1: `auto-simplify-queue` requires a legacy bridge row that doesn't exist

The `auto-simplify-queue` function (runs every 10 minutes via cron) finds qualifying articles but then tries to look up a matching row in the legacy `articles` table by URL. For multi-tenant articles, no such bridge row exists. The logs confirm this -- **every single qualifying article is skipped with "no articles entry"**:

```text
⏭️ Skipping article cfa2f172-...: no articles entry
⏭️ Skipping article 82095b34-...: no articles entry
⏭️ Skipping article bd9e083d-...: no articles entry
... (20 articles found, 0 queued)
```

The function requires `article_id` (legacy FK) to insert into the queue, but the `queue-processor` already handles multi-tenant jobs perfectly well using just `topic_article_id` + `shared_content_id` -- no `article_id` needed.

### Blocker 2: `auto-simplify-queue` never calls the queue processor

Even if articles were successfully queued, `auto-simplify-queue` only inserts into `content_generation_queue` and returns. It never invokes `queue-processor` to actually generate the stories. The only cron that calls `queue-processor` is `automated-scheduler` (runs at 2am, 6am, 6pm) -- so queued items could sit for hours before processing.

### Blocker 3: `auto-illustrate-stories` is never triggered

No cron job calls `auto-illustrate-stories`. It's only called inside `eezee-automation-service`, which itself has **zero cron triggers** and **zero recent logs** -- it's completely orphaned code. So even after stories are created, illustration never happens automatically.

---

## Fix Plan

Rewrite `auto-simplify-queue` to be a complete Holiday Mode orchestrator:

### Change 1: Remove the legacy bridge row requirement

Instead of the current flow:
```text
topic_articles → shared_article_content.url → articles.source_url → article_id
```

Queue directly as multi-tenant:
```text
topic_articles → insert queue with (topic_article_id, shared_content_id) only
```

This matches how `eezee-automation-service` Phase 3b already queues (lines 320-331) and how `queue-processor` already handles multi-tenant jobs (line 86-87).

### Change 2: Invoke `queue-processor` after queuing

After all articles are queued, call `supabase.functions.invoke('queue-processor')` to immediately process them into stories. This closes the gap between queuing and processing.

### Change 3: Invoke `auto-illustrate-stories` after processing

After the queue processor completes, call `auto-illustrate-stories` for each topic that had articles processed. This completes the full pipeline: Gather → Simplify → Illustrate.

### Change 4: Mark articles as `processed` when queued

Currently `auto-simplify-queue` doesn't update `topic_articles.processing_status`, so the same articles get re-evaluated every 10 minutes (and skipped via the "already queued" check). Update status to `processed` on successful queue insertion, matching `eezee-automation-service` behavior.

---

## Technical Detail

### Files Modified
- `supabase/functions/auto-simplify-queue/index.ts` -- rewrite core logic

### What's removed
- The entire "bridge row" lookup chain (lines 88-118): fetching `shared_article_content` URLs, looking up `articles` by `source_url`, requiring `article_id`
- The `article_id` field from queue inserts

### What's added
- Direct multi-tenant queue insertion with just `topic_article_id` + `shared_content_id`
- `topic_articles.processing_status` update to `processed` after queuing
- Story existence check via `topic_article_id` (not `article_id`)
- Post-queue invocation of `queue-processor`
- Post-processing invocation of `auto-illustrate-stories` per topic
- Topic-level tracking of which topics had new items queued (for targeted illustration)

### What stays the same
- The topic settings query (line 37-40) -- already correctly filters for holiday mode
- The quality threshold filtering (line 71-78)
- The duplicate queue check (lines 134-149)
- The system log at the end

### Safety
- All changes are within `auto-simplify-queue` only -- no other functions modified
- `queue-processor` and `auto-illustrate-stories` already work correctly (confirmed by existing logs)
- Fallback: if `queue-processor` or `auto-illustrate-stories` invocation fails, it logs the error but doesn't break the queuing step

