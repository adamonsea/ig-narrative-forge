## ✅ COMPLETED: Sort Audio Briefings by Popularity (Engagement)

This plan has been implemented.

### Changes Made
- Updated `supabase/functions/generate-daily-roundup/index.ts`
- Updated `supabase/functions/generate-weekly-roundup/index.ts`

Both functions now:
1. Fetch stories for the period (without ordering by created_at)
2. Query `story_interactions` to count swipes for each story
3. Sort by swipe count (popularity), with `created_at` as fallback for ties
4. Log the top story by engagement for debugging

### Result
Audio briefings now feature the most engaged stories (by swipe count) rather than just the most recent ones.
