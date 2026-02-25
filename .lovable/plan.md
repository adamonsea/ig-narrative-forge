

## Audit: Tone, Writing Style, and Expertise Settings Flow

### Findings

I traced the full path from UI selection through queue insertion, queue processing, and AI prompt injection. There are **four bugs** that prevent settings from properly influencing AI generation.

---

### Bug 1: `queue-processor` drops `writingStyle` entirely

**File:** `supabase/functions/queue-processor/index.ts`, line 225-230

The queue-processor builds the request body for `enhanced-content-generator` but **never passes `writingStyle`**. It reads `job.writing_style` only to incorrectly derive `audienceExpertise`:

```typescript
// CURRENT (broken)
const generatorBody: any = {
  slideType: job.slidetype,
  aiProvider: job.ai_provider || 'deepseek',
  tone: job.tone || 'conversational',
  audienceExpertise: job.writing_style === 'journalistic' ? 'intermediate' : 'beginner'
};
```

The `writingStyle` field is never sent. The generator then falls back to `'journalistic'` regardless of what the user selected.

**Fix:** Add `writingStyle: job.writing_style || 'journalistic'` and use `job.audience_expertise` (which exists on the queue table) instead of deriving it from writing style.

---

### Bug 2: `queue-processor` ignores `audience_expertise` from the queue

The `content_generation_queue` table has an `audience_expertise` column, and `useMultiTenantActions` correctly inserts `audience_expertise: 'intermediate'` (line 155). But the queue-processor ignores it entirely, instead computing a wrong value from `writing_style`.

**Fix:** Change to `audienceExpertise: job.audience_expertise || 'intermediate'`.

---

### Bug 3: `auto-simplify-queue` inserts jobs without tone, writing style, or expertise

**File:** `supabase/functions/auto-simplify-queue/index.ts`, lines 165-174

When automation queues articles, it inserts bare-minimum fields:

```typescript
await supabase.from('content_generation_queue').insert({
  topic_article_id: article.id,
  shared_content_id: article.shared_content_id,
  status: 'pending',
  // ← NO tone, writing_style, audience_expertise, slidetype
});
```

This means every auto-queued article uses hardcoded defaults (`conversational`, `journalistic`, `intermediate`) regardless of what the topic owner configured in Content Voice Settings.

**Fix:** Look up the topic's `default_tone`, `default_writing_style`, and `audience_expertise` from the `topics` table and include them in the queue insert.

---

### Bug 4: `enhanced-content-generator` request defaults shadow topic defaults

**File:** `supabase/functions/enhanced-content-generator/index.ts`, lines 738-834

The request body destructuring sets defaults:
```typescript
const { tone = 'conversational', writingStyle = 'journalistic', audienceExpertise = 'intermediate' } = await req.json();
```

Then the topic lookup does:
```typescript
topicExpertise = audienceExpertise || topicData.audience_expertise;
effectiveTone = tone || topicData.default_tone;
effectiveWritingStyle = writingStyle || topicData.default_writing_style;
```

Since destructuring defaults mean `tone` is always `'conversational'` (never `undefined`), the `||` fallback to `topicData.default_tone` **never fires**. Topic-level defaults are dead code.

**Fix:** Use `undefined` as the destructuring default, or check for explicit `null`/`undefined` before falling back to topic defaults. The cleanest approach: only apply topic defaults when the queue didn't provide an explicit value.

---

### Implementation Plan

| Priority | File | Change |
|----------|------|--------|
| 1 | `supabase/functions/queue-processor/index.ts` | Pass `writingStyle` and use `job.audience_expertise` instead of deriving from writing_style |
| 2 | `supabase/functions/enhanced-content-generator/index.ts` | Fix destructuring defaults to allow topic-level fallbacks to work |
| 3 | `supabase/functions/auto-simplify-queue/index.ts` | Fetch topic defaults and include `tone`, `writing_style`, `audience_expertise`, `slidetype` in queue inserts |
| 4 | `src/hooks/useMultiTenantActions.tsx` | Pass `audience_expertise` from topic settings instead of hardcoded `'intermediate'` (line 155) |

### Expected Result

After these fixes:
- Manual approvals: tone/style/expertise selected per-article in the UI will reach the AI prompt
- Auto-simplify: topic-level defaults from Content Voice Settings will be used
- Topic-level fallbacks: if no per-article override exists, the topic owner's configured defaults apply
- All three guidance blocks (tone, writing style, expertise) will inject the correct instructions into the DeepSeek prompt

