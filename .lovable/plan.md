

## Sort Audio Briefings by Popularity (Engagement)

### The Problem
Currently, both the **daily and weekly roundup** edge functions sort stories by `created_at` (most recent first) when selecting which stories to include in the audio briefing:

```sql
.order('created_at', { ascending: false })
```

This means the briefing reads out the most recently published stories, not the most popular ones that readers actually engaged with.

### What Engagement Data Exists

Your database has excellent engagement tracking in the `story_interactions` table:
- **Swipe counts** for every story (how many times it was swiped in Play Mode)
- Already used by the `get_popular_stories_by_period` RPC function
- Sample data shows some stories have 20-25 swipes, while others have very few

For example, the top engaged Eastbourne stories:
1. "Why we should welcome the new Eastbourne Neighbourhood Board" - **23 swipes**
2. "Southern Water 'enhance monitoring' after bio-beads spill" - **23 swipes**
3. "Willingdon man 'shrinks 3cm' after cancer misdiagnosis" - **21 swipes**

### The Solution

Modify the story selection query in both roundup functions to:

1. **Join with `story_interactions`** to get swipe counts
2. **Order by swipe count** (popularity) instead of created_at
3. **Fall back to created_at** for stories with equal engagement

---

### Technical Changes

**Files to modify:**
- `supabase/functions/generate-daily-roundup/index.ts`
- `supabase/functions/generate-weekly-roundup/index.ts`

**Query change (both functions):**

From:
```javascript
const { data: stories } = await supabase
  .from('stories')
  .select('...')
  .order('created_at', { ascending: false });
```

To:
```javascript
// Step 1: Get stories for the period
const { data: stories } = await supabase
  .from('stories')
  .select('...')
  .gte('created_at', startOfDay.toISOString())
  .lte('created_at', endOfDay.toISOString());

// Step 2: Get engagement counts for these stories
const storyIds = stories.map(s => s.id);
const { data: engagementData } = await supabase
  .from('story_interactions')
  .select('story_id')
  .in('story_id', storyIds)
  .eq('interaction_type', 'swipe');

// Step 3: Count swipes per story and sort by popularity
const swipeCountMap = new Map();
engagementData?.forEach(row => {
  swipeCountMap.set(row.story_id, (swipeCountMap.get(row.story_id) || 0) + 1);
});

const sortedStories = stories.sort((a, b) => {
  const aSwipes = swipeCountMap.get(a.id) || 0;
  const bSwipes = swipeCountMap.get(b.id) || 0;
  if (bSwipes !== aSwipes) return bSwipes - aSwipes; // More swipes first
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // Fallback to newest
});
```

### Result

After this change:
- **Daily briefings** will highlight the most engaged stories of the day
- **Weekly briefings** will feature the week's most popular stories
- Stories with zero engagement will still appear, sorted by recency as a fallback
- The audio briefing intro can say "Here are the stories you engaged with most" instead of just "top stories"

### Testing

After deployment, regenerate the Eastbourne weekly roundup and verify the briefing now features stories like "Eastbourne Neighbourhood Board" (23 swipes) instead of just the most recent ones.

