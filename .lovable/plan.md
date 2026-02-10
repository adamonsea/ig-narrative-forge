

## Tighter Duplicate Detection, Flagging, and Fresh-Angle Rewrites

### Problems identified

1. **Story not reappearing in Arrivals after delete/return** -- The `delete_story_cascade` function resets `topic_articles.processing_status` to `'new'` only when it's currently `'processed'`. If the status was anything else (e.g. already `'new'` from a race condition or `'queued'`), the reset silently skips. The `rejectMultiTenantStory` in `useMultiTenantActions.tsx` does a second explicit reset, but the arrivals panel may not auto-refresh if the real-time subscription misses the update.

2. **Duplicate detection is URL-only** -- Currently, duplicates are caught by `normalized_url` matching. Two articles about the same event from different sources (different URLs) are treated as completely separate items. There is no title-similarity detection at the arrivals level.

3. **Auto-publish publishes all duplicates** -- When `auto_simplify_enabled` is on, every queued article gets processed and published regardless of whether a near-identical story was already published recently.

4. **AI rewriter has basic "recent coverage" context** -- The `fetchRecentSimilarStories` function in `enhanced-content-generator` already injects context about recent similar stories, but it uses a simple word-overlap heuristic (>30% match on 5+ letter words). This could be strengthened and made more directive.

---

### Plan

#### Part 1: Fix "deleted story not appearing in arrivals"

**File: `supabase/migrations/new_migration.sql`**
- Update `delete_story_cascade` to remove the `AND processing_status = 'processed'` condition -- always reset to `'new'` when a story is deleted, regardless of current status.

**File: `src/components/UnifiedContentPipeline.tsx`**
- After `handleMultiTenantRejectStory` completes, explicitly trigger `refreshData()` to force the arrivals list to reload.

#### Part 2: Title-similarity duplicate flagging in Arrivals

**File: `src/hooks/useMultiTenantTopicPipeline.tsx`**
- After loading articles, run a title-similarity pass:
  - Normalize titles (lowercase, strip punctuation, remove common stop words)
  - Group articles where the normalized title similarity exceeds 70% (using word overlap, same approach as the content generator)
  - Mark duplicate groups with a `duplicateGroupId` and `isDuplicateLeader` flag (oldest article = leader)

**File: `src/components/topic-pipeline/MultiTenantArticlesList.tsx`**
- Display a "Duplicate" badge on articles flagged as duplicates
- Show which other article(s) they match with (tooltip)
- Group visual: slight indent or border-left color for non-leader duplicates
- Leader article shows "N similar articles" count

#### Part 3: Auto-publish only the first (leader) duplicate

**File: `supabase/functions/queue-processor/index.ts`**
- Before processing a job, check if a story was already published in the last 48 hours with a similar title (>70% word overlap) for the same topic
- If yes: mark the job as `completed` with `skipped: true, reason: 'duplicate_story_recently_published'`
- This prevents the auto-pipeline from flooding the feed with near-identical stories

**File: `supabase/functions/enhanced-content-generator/index.ts`**
- Before generating content, perform the same title-similarity check
- If a similar story was recently published, return early with `{ success: true, skipped: true, reason: 'duplicate_coverage' }`

#### Part 4: Strengthen fresh-angle instructions to AI rewriter

**File: `supabase/functions/enhanced-content-generator/index.ts`**
- Improve `fetchRecentSimilarStories`:
  - Increase the word-overlap threshold from 0.3 to 0.4 for the "similar" designation, but add a new 0.6+ tier for "very similar / likely duplicate"
  - For "very similar" stories (0.6+), inject a stronger directive: list the specific headline and angle used, and explicitly instruct "You MUST find a completely different angle -- focus on [consequences / reaction / different stakeholder / timeline progression]"
  - Include the published slide content (not just the first slide) so the AI knows what was already said
  - Add a `recent_angles_used` array in the prompt listing the angles of similar recent stories, so the AI can explicitly avoid them

- Update the system prompt to include:
  ```
  ANTI-REPETITION RULES:
  - If recent coverage context is provided, you MUST NOT repeat the same headline angle
  - Each story must offer the reader something NEW they haven't seen
  - Acceptable fresh angles: new developments, reactions, consequences, different stakeholders, broader context, human interest, data/statistics focus
  - If you cannot find a genuinely new angle, say so in the first slide rather than rehashing
  ```

---

### Summary of files to modify

| File | Change |
|------|--------|
| New migration SQL | Remove `processing_status = 'processed'` guard from `delete_story_cascade` |
| `src/components/UnifiedContentPipeline.tsx` | Force refresh after story rejection/deletion |
| `src/hooks/useMultiTenantTopicPipeline.tsx` | Add title-similarity duplicate grouping logic |
| `src/components/topic-pipeline/MultiTenantArticlesList.tsx` | Display duplicate badges and grouping UI |
| `supabase/functions/queue-processor/index.ts` | Skip processing if similar story recently published |
| `supabase/functions/enhanced-content-generator/index.ts` | Strengthen duplicate check + fresh-angle prompting |

### What the user experiences

- **Arrivals**: Deleted/returned stories reliably reappear. Articles about the same event from different sources show a "Duplicate" badge and are visually grouped.
- **Auto-publish**: Only the first story on a given topic gets auto-published. Duplicates are skipped with a log entry.
- **Feed quality**: Stories about repeat topics use a genuinely different angle, reducing the feeling of repetitive content.

