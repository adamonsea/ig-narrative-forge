

## Comprehensive Audio Briefings Enhancement

### Current State
The audio briefing currently:
- Uses **2,000 character limit** (~30-40 seconds of audio)
- Only reads out story **headlines** with basic transitions
- Costs approximately **2,000 credits per briefing** on the ElevenLabs Basic tier (40,000 credits/month)

### ElevenLabs Pricing Analysis

Based on the current pricing structure:

| Plan | Monthly Cost | Credits | Cost per 1,000 chars |
|------|-------------|---------|---------------------|
| Basic | $5/month | 30,000 | ~$0.17 |
| Creator | $22/month | 100,000 | ~$0.22 |
| Pro | $99/month | 500,000 | ~$0.20 |

**For a 2-minute briefing:**
- Speaking rate: ~150-160 words per minute
- 2 minutes = ~300-320 words = **~2,000-2,400 characters**
- This means a 2-minute briefing costs roughly **2,000-2,400 credits**

With your Basic tier (40,000 credits/month), you could generate approximately **16-20 comprehensive 2-minute briefings per month**.

### What's Available for Richer Content

Your database has excellent content for more detailed briefings:

1. **Story headlines** (already used)
2. **AI-generated social captions** (`story_social_content.caption`) - These are conversational, engaging summaries perfect for spoken audio
3. **Full article body** (`shared_article_content.body`) - Could extract key sentences
4. **Source attribution** (publication name, author, domain)

### Proposed Implementation

**New Script Structure for ~2,400 characters (2 minutes):**

```text
Good morning! Here's your weekly Eastbourne roundup for the week of January 26th.

We've got 80 stories to share this week, but let me highlight the most important ones.

[STORY 1 - Lead story with detail]
Our top story this week: Winnie the Pooh comes to life as Ashdown Forest 
celebrates his centenary. The iconic Sussex forest that inspired A.A. Milne 
is celebrating 100 years with a giant puppet and new nature walks. Local 
schools and the public are invited to help name the creature and submit 
drawings.

[STORY 2 - Secondary with context]
In entertainment news: Edrix Puzzle are Jazz Hastings' February guests, 
bringing jazz to the south coast.

[STORY 3 - Brief mention]
Meanwhile, an East Sussex killer-clown horror film has been unveiled.

[STORY 4 - Brief with context]
On the property front: Eastbourne has seen the biggest fall in property 
prices in England this period.

[STORY 5 - Quick mention]
Plus, the town's parks and beaches are getting a long-term investment plan.

That's your briefing. Check the feed for 75 more stories. Have a great week!
```

### Cost Projections

| Briefing Type | Chars | Duration | Credits | Briefings/Month (40k) |
|--------------|-------|----------|---------|----------------------|
| Current (headlines only) | ~500 | ~20 sec | 500 | 80 |
| Extended headlines | 1,500 | ~1 min | 1,500 | 26 |
| **Comprehensive (proposed)** | 2,400 | ~2 min | 2,400 | 16 |
| Premium detailed | 4,000 | ~3 min | 4,000 | 10 |

### Technical Approach

1. **Modify the edge function** to:
   - Accept a `briefingStyle` parameter: `'quick'` (current) | `'standard'` (1 min) | `'comprehensive'` (2 min)
   - Query `story_social_content` to fetch AI-generated summaries for top stories
   - Build a natural script with lead story detail and supporting story mentions

2. **Script generation logic**:
   - Lead story: headline + first 2-3 sentences of social caption (~300 chars)
   - Stories 2-3: headline + one-sentence context (~150 chars each)
   - Stories 4-5: headline only with transition (~60 chars each)
   - Intro + outro + transitions (~200 chars)

3. **Configurable per topic/feed**: Allow feed owners to choose briefing length in settings

### Recommendation

For your current 40,000 credits/month budget:
- **Daily feeds**: Use "standard" (1 min, ~1,500 chars) = supports 26 daily briefings
- **Weekly feeds**: Use "comprehensive" (2 min, ~2,400 chars) = richer weekly experience

This gives you headroom for ~4 weekly comprehensive briefings + ~10-12 daily standard briefings per month.

---

### Technical Details

**Files to modify:**
- `supabase/functions/generate-audio-briefing/index.ts` - Add briefing style parameter and enhanced script builder
- Optionally: Add `briefing_style` column to `topics` table for per-topic configuration

**Database queries needed:**
- Join `stories` → `story_social_content` to get rich summaries
- Fallback to headline-only if no social content exists

