

# Gentle Nudge: Reduce "Spokesperson" Photos

## The Problem

The `extractSubjectMatter` function uses few-shot examples that bias toward formal public appearances:
- "speaking at a community town hall meeting"
- "cutting ribbon at new community centre opening"

When the AI sees news about a person, it defaults to the most "newsy" framing: press conferences, podiums, microphones, formal speeches. These are visually repetitive and don't capture the **story's actual content**.

## The Solution: Subtle Prompt Adjustments

Three gentle tweaks to the subject extraction prompt:

### 1. Add Variety Guidance (One Line)

Add a single line discouraging generic "speaking" scenarios:

```
VARIETY NOTE: Avoid defaulting to generic "speaking at podium/press conference" unless the story is specifically about a speech or announcement. Prefer showing the subject engaged in the story's actual context.
```

### 2. Rebalance Examples

Replace the formal examples with more contextual ones:

**Before:**
- "MP Stephen Lloyd, middle-aged man in suit, speaking at a community town hall meeting"
- "Councillor Sarah Thompson, woman in her 40s, cutting ribbon at new community centre opening"

**After:**
- "MP Stephen Lloyd, middle-aged man, walking through the affected neighbourhood with local residents"
- "Councillor Sarah Thompson, woman in her 40s, examining plans for the new community centre with architects"
- "NHS nurse Maria Santos, woman in her 30s, checking equipment in a busy hospital corridor"
- "Local farmer James Wilson, weathered man in his 60s, inspecting flood damage to his fields"

### 3. Add "Context Over Ceremony" Instruction

Add to the CRITICAL REQUIREMENTS:
```
- SHOW THE STORY, not the announcement of it—if the story is about flooding, show flood context; if about a new business, show the business in action
```

## Implementation

**File:** `supabase/functions/_shared/prompt-helpers.ts`

**Lines 82-103** - Update the `extractSubjectMatter` function prompt

---

## Expected Outcome

Instead of:
- "MP speaking at podium about flood relief" → generic press conference

We'll get:
- "MP in wellington boots surveying flooded streets with residents" → contextual scene

The AI will still produce formal photos when genuinely appropriate (actual speeches, press conferences, ceremonial events), but will default to **story context** rather than **announcement format**.

---

## Technical Details

```typescript
// Updated prompt excerpt
content: `Extract the main visual subject from this story in 20-35 words for image generation.

CRITICAL REQUIREMENTS:
- INCLUDE SPECIFIC NAMES when mentioned (e.g., "MP Stephen Lloyd", "Chef Gordon Ramsay")
- Include their ROLE or TITLE (MP, councillor, business owner, chef, teacher, etc.)
- Specify gender (man/woman) and approximate age if apparent from context
- SHOW THE STORY, not the announcement—if about flooding, show flood context; if about a new business, show the business in action
- Focus on the PRIMARY person/people in their actual story context

VARIETY NOTE: Avoid defaulting to "speaking at podium/press conference/media scrum" unless the story is specifically about a speech or formal announcement. Prefer showing the subject engaged in the story's real-world context.

Example outputs:
- "MP Stephen Lloyd, middle-aged man, walking through flood-damaged streets talking with affected residents"
- "Chef Gordon Ramsay, 50s, tasting dishes in his restaurant kitchen surrounded by staff"
- "Councillor Sarah Thompson, woman in her 40s, examining architectural plans with the project team"
- "NHS midwife Jenny Chen, woman in her 30s, in a hospital maternity ward with medical equipment"
- "Local farmer James Wilson, weathered man in his 60s, inspecting storm damage to his barn"
- "Business owner David Chen in his newly renovated cafe interior, arranging furniture before opening"
...`
```

---

## Why This Works

- **No sledgehammer:** The word "avoid" is softer than "never"—it allows press conference shots when genuinely relevant
- **Better examples:** 6 examples instead of 4, with more variety in settings and actions
- **Context-first thinking:** "SHOW THE STORY, not the announcement" reframes the AI's approach
- **Same cost:** No additional API calls, just better prompting

