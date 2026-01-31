
## Fix: Automated Image Generation for All Stories

### Problem Summary
Stories created manually on Jan 30th didn't get illustrations automatically. You generated them yourself this morning around 09:20. The automation pipeline has a gap where:
- **Full automation path works**: Scrape → Queue → `enhanced-content-generator` → `story-illustrator` ✓
- **Manual simplification path breaks**: Dashboard Simplify → creates story but illustration may not trigger reliably

### Root Cause
1. There's no dedicated cron job for `auto-illustrate-stories` to catch stories without cover images
2. When `enhanced-content-generator` calls `story-illustrator`, any error silently fails without retry
3. The `eezee-automation-service` (which would call `auto-illustrate-stories`) is disabled

---

## Implementation Plan

### 1. Add Cron Job for Auto-Illustration Catch-Up
Create a new cron job that runs periodically to find and illustrate any stories missing cover images.

**Database Migration:**
```sql
-- Add cron job to auto-illustrate stories every hour
SELECT cron.schedule(
  'auto-illustrate-stories-hourly',
  '15 * * * *',  -- Every hour at :15 past
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/auto-illustrate-stories',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
    body := '{"maxIllustrations": 10}'::jsonb
  ) as request_id;
  $$
);
```

### 2. Update `auto-illustrate-stories` Function
Modify the function to:
- Process stories from all topics with Holiday Mode enabled (not just when explicitly called with topicId)
- Remove the 24-hour age restriction to catch older unillustrated stories
- Add logging for better observability

**Changes to `supabase/functions/auto-illustrate-stories/index.ts`:**
- Add global scanning when no topicId provided
- Process stories up to 7 days old (not just 24 hours)
- Better error handling and logging

### 3. Add Fallback in `queue-processor`
After `enhanced-content-generator` succeeds, explicitly verify the illustration was created and queue a retry if not.

**Changes to `supabase/functions/queue-processor/index.ts`:**
- After story creation completes, check if `cover_illustration_url` is populated
- If not, queue a dedicated illustration job

---

## Technical Changes

### File: `auto-illustrate-stories/index.ts`
- Line ~70: Change age filter from 24 hours to 7 days
- Line ~55-85: Add logic to scan ALL Holiday Mode topics when no topicId provided
- Add better success/failure logging

### File: New Migration
- Create hourly cron job for `auto-illustrate-stories`

### File: `queue-processor/index.ts` (Optional Enhancement)
- Add illustration verification step after story generation

---

## Expected Outcome
1. **Immediate**: Hourly cron catches any unillustrated stories and generates images
2. **Reliable**: Stories created via any path (manual or automated) will get illustrations within 1 hour max
3. **Observable**: Better logging to track illustration success/failure

---

## Alternative Approach (Simpler)
If you prefer minimal changes:
- Just add the hourly cron job for `auto-illustrate-stories`
- This acts as a safety net without modifying existing generation logic

This approach ensures all Holiday Mode topics get their stories illustrated automatically, regardless of how the story was created.
