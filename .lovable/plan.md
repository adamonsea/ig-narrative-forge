
# Diagnosis & Fix Plan: Story Lifecycle Tracking Issues

## Issue Summary

Based on investigation, I found **three distinct issues**:

1. **Missing Historical Timestamps**: The "Town hall creative hub" story EXISTS and has 12 slides, but lifecycle columns (`simplified_at`, `is_auto_*`) are NULL because it was created BEFORE the tracking feature was implemented
2. **`is_auto_illustrated` Not Recording Properly**: Even fresh stories show `is_auto_illustrated: false` - there may be a parameter naming mismatch
3. **Weekend Automation IS Working**: Logs confirm automation ran every hour over the weekend with no errors

---

## Technical Analysis

### Finding 1: Historical Data Gap

The "Town hall creative hub" story:
- **ID**: `7a5e98a9-5eba-4b24-b9b3-a1faa24c6b62`
- **Created**: December 19, 2025
- **Status**: Published with 12 slides and visual prompts
- **Problem**: `simplified_at: null`, all `is_auto_*` flags are `false`

This is expected - the lifecycle tracking migration was recent. Stories created before the migration have no timestamps.

### Finding 2: Auto-Illustrate Flag Mismatch

Looking at the code:
- `auto-illustrate-stories` passes: `{ storyId, qualityTier: 'low', isAutomated: true }`
- `story-illustrator` schema expects: `{ storyId, model (optional), isAutomated (optional) }`

The `qualityTier` parameter is not in the schema, so it gets stripped by Zod. However, `isAutomated: true` should still work.

**Potential Issue**: When `supabase.functions.invoke()` calls another function, the request body must be in `body` property. Let me verify this is happening correctly.

### Finding 3: Automation Confirmation

System logs show:
- `universal-topic-automation` ran every hour from Feb 1-2
- 3 stories auto-simplified on Feb 2 with `is_auto_simplified: true` ✓
- `drip-feed-scheduler` and `automated-roundup-notifier` are active

---

## Proposed Fixes

### Fix 1: Backfill Historical Story Timestamps

Create a database function to backfill approximate timestamps for older stories based on their `created_at` date:

```sql
-- Backfill simplified_at for stories that have slides but no timestamp
UPDATE stories
SET simplified_at = created_at
WHERE simplified_at IS NULL
AND id IN (SELECT DISTINCT story_id FROM slides);

-- Mark stories as gathered (all stories were gathered)
UPDATE stories
SET is_auto_gathered = false  -- Default to manual for historical
WHERE is_auto_gathered IS NULL;
```

### Fix 2: Verify Auto-Illustrate Flow

1. Add logging to `story-illustrator` to confirm `isAutomated` is received
2. Check if the flag is correctly set in the database update

### Fix 3: Add Diagnostic Query to Admin Panel

Add a "Lifecycle Audit" section showing:
- Stories with slides but no `simplified_at`
- Stories with illustrations but no `illustration_generated_at`
- Orphaned lifecycle data

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/xxx.sql` | Backfill historical timestamps |
| `supabase/functions/story-illustrator/index.ts` | Add debug logging for `isAutomated` flag |
| `src/pages/AdminPanel.tsx` | Add lifecycle audit section |
| `supabase/functions/auto-illustrate-stories/index.ts` | Verify invocation format |

---

## Quick Verification Steps

1. **Check if recent illustration was auto**: 
   ```sql
   SELECT title, illustration_generated_at, is_auto_illustrated 
   FROM stories 
   WHERE illustration_generated_at > '2026-02-01'
   ```

2. **Count missing timestamps**:
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE simplified_at IS NULL AND EXISTS (SELECT 1 FROM slides WHERE story_id = stories.id)) as missing_simplified,
     COUNT(*) FILTER (WHERE illustration_generated_at IS NULL AND cover_illustration_url IS NOT NULL) as missing_illustrated
   FROM stories
   ```

---

## Implementation Order

1. Run backfill migration to populate historical timestamps
2. Add debug logging to edge functions
3. Deploy and test with a new auto-illustrated story
4. Add admin panel audit section for ongoing monitoring
