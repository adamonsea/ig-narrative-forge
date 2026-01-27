
# Animation Instructions Modal Fixes

## Problems to Solve

1. **Incorrect credit cost display**: The modal shows "Cost: Free" for superadmins, but should show the actual credit cost for all users (just bypass the deduction for superadmins). The cost should also be comparable to image generation.

2. **Stale suggestion pills**: The suggestion pills are based on a previously opened story, not the current story. This is caused by:
   - The `useMemo` dependency on the full `story` object may not detect field changes properly
   - The `customPrompt` state persists between different stories

3. **Credit cost alignment**: Animation should cost comparable credits to image generation (images cost 2-10 credits based on tier, animations currently use 1-2 credits).

---

## Implementation Plan

### 1. Fix Credit Cost Display

**File: `src/components/topic-pipeline/AnimationInstructionsModal.tsx`**

Update the credit cost constant and display logic:
- Change `ANIMATION_CREDITS` from 1 to 2 (matching the "fast" tier default or aligning with image costs)
- Display the actual credit cost for all users (not "Free" for superadmins)
- Only the deduction is bypassed for superadmins, not the cost visibility

```typescript
// Change from:
const ANIMATION_CREDITS = 1;

// Change to:
const ANIMATION_CREDITS = 2; // Comparable to low-tier image generation

// Update display logic:
// From: 'Cost: {isSuperAdmin ? 'Free' : `${ANIMATION_CREDITS} credit`}'
// To: 'Cost: {ANIMATION_CREDITS} credits'
```

### 2. Fix Stale Suggestions Bug

**File: `src/components/topic-pipeline/AnimationInstructionsModal.tsx`**

The suggestions must regenerate when the story changes. Fix the memoization:

```typescript
// Update useMemo to depend on specific story fields, not just the object:
const suggestions = useMemo(() => {
  if (!story) return [];
  return generateSuggestions({
    cover_illustration_prompt: story.cover_illustration_prompt,
    headline: story.headline,
    title: story.title,
    tone: story.tone,
  });
}, [story?.id, story?.cover_illustration_prompt, story?.headline, story?.title, story?.tone]);
```

Additionally, reset `customPrompt` when the story changes (not just on close):

```typescript
// Add useEffect to reset state when story changes:
useEffect(() => {
  setCustomPrompt('');
}, [story?.id]);
```

### 3. Update Props Interface

**File: `src/components/topic-pipeline/AnimationInstructionsModal.tsx`**

Add story `id` to the interface to enable proper dependency tracking:

```typescript
interface AnimationInstructionsModalProps {
  // ... existing props
  story: {
    id: string;  // Already exists - ensure it's used in dependencies
    headline?: string;
    title?: string;
    cover_illustration_url?: string | null;
    cover_illustration_prompt?: string | null;
    tone?: string | null;
  } | null;
}
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `AnimationInstructionsModal.tsx` | Fix credit cost to 2, show cost for all users, fix useMemo dependencies, add useEffect to reset state on story change |

---

## Technical Details

- **Credit alignment**: 2 credits for animation matches the entry-level image generation tier, making the cost structure consistent
- **State reset**: Using `story?.id` as a dependency ensures the modal resets when switching between stories
- **Memoization fix**: Listing individual fields as dependencies ensures React detects changes even when the object reference is the same but fields differ
