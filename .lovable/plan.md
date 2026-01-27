
# Animation Instructions Modal - Updated Plan

## Overview
Build a modal that lets users guide **what parts of the image to animate and how**, without impacting the style or story meaning. Include clear guidance in pithy language and smart suggestion pills derived from the image/story context.

## Key Principle
**Instructions control motion, not meaning.** Users tell the AI which elements should move and how they should move - but the visual style, color palette, and story interpretation remain untouched.

---

## Component Design

### AnimationInstructionsModal.tsx

```text
+----------------------------------------------------------+
|  Animate Illustration                            [X]      |
+----------------------------------------------------------+
|                                                           |
|  "Guide the motion, not the meaning."                     |
|  Tell the AI what to animate and how it should move.      |
|  Style and story stay exactly as they are.                |
|                                                           |
|  ── Smart Suggestions ──────────────────────────────      |
|                                                           |
|  [Gentle head nod] [Hand gesture] [Paper flutter]         |
|  [Background still, subject sways] [Subtle breathing]     |
|                                                           |
|  ── Or write your own ──────────────────────────────      |
|                                                           |
|  +-----------------------------------------------------+  |
|  | e.g., "Focus on the hands, slight movement in the   |  |
|  | papers, everything else frozen"                     |  |
|  +-----------------------------------------------------+  |
|                                                           |
|  Quality: [720p Standard v]        Cost: 2 credits        |
|                                                           |
|  [Cancel]                          [Generate Animation]   |
+----------------------------------------------------------+
```

---

## Smart Suggestion System

### How Suggestions Are Generated

Based on available story data:

1. **From `cover_illustration_prompt`** (most reliable)
   - Extract subject type: person, crowd, building, vehicle
   - Suggest appropriate movements for that subject

2. **From `headline` / `title`**
   - Keyword matching for context (council meeting, protest, construction, etc.)
   
3. **From `tone`**
   - Adjust intensity of suggested movements (urgent vs. somber)

### Example Suggestion Mappings

| Context | Suggestion Pills |
|---------|------------------|
| Person/Official | "Subtle nod" / "Hand gesture" / "Weight shift" / "Paper shuffle" |
| Crowd/Protest | "Closest figure sways" / "Signs flutter" / "One person gestures" |
| Building | "Flag flutter" / "Window light flicker" / "Smoke wisps" |
| Vehicle | "Idle vibration" / "Exhaust movement" |
| Generic | "Focus on center" / "Gentle breathing motion" / "Subtle sway" |

### Suggestion Generator Function

```typescript
function generateSmartSuggestions(story: {
  cover_illustration_prompt?: string;
  headline: string;
  tone?: string;
}): string[] {
  const prompt = story.cover_illustration_prompt?.toLowerCase() || '';
  const title = story.headline.toLowerCase();
  
  // Subject-based suggestions
  if (prompt.match(/person|official|councillor|worker|figure/)) {
    return [
      "Gentle head nod",
      "Subtle hand gesture", 
      "Slight weight shift",
      "Papers shuffle on desk"
    ];
  }
  
  if (prompt.match(/crowd|group|protesters|gathering/)) {
    return [
      "Closest figure sways gently",
      "One raised sign moves",
      "Single person gestures",
      "Background frozen, center moves"
    ];
  }
  
  // Title-based suggestions (fallback)
  if (title.match(/council|meeting|debate/)) {
    return [
      "Official nods slightly",
      "Hand gesture while speaking",
      "Document movement only"
    ];
  }
  
  // Generic suggestions
  return [
    "Central subject breathes",
    "Gentle motion in focal point",
    "Subtle movement, static background"
  ];
}
```

---

## UI Components

### Guidance Header
Pithy, unmissable guidance at the top of the modal:

```tsx
<div className="text-center space-y-1 pb-4 border-b">
  <p className="font-medium text-foreground">
    "Guide the motion, not the meaning."
  </p>
  <p className="text-sm text-muted-foreground">
    Tell the AI what to animate and how - style stays untouched.
  </p>
</div>
```

### Suggestion Pills

Clickable badges that populate the textarea:

```tsx
<div className="space-y-2">
  <Label className="text-sm font-medium">Smart Suggestions</Label>
  <div className="flex flex-wrap gap-2">
    {suggestions.map((suggestion) => (
      <Badge
        key={suggestion}
        variant={selectedSuggestion === suggestion ? "default" : "outline"}
        className="cursor-pointer hover:bg-primary/10"
        onClick={() => handleSelectSuggestion(suggestion)}
      >
        {suggestion}
      </Badge>
    ))}
  </div>
</div>
```

### Custom Input Textarea

```tsx
<div className="space-y-2">
  <Label className="text-sm font-medium">Or write your own</Label>
  <Textarea
    placeholder='e.g., "Focus on hands, papers move slightly, face stays still"'
    value={customPrompt}
    onChange={(e) => setCustomPrompt(e.target.value)}
    maxLength={200}
    className="min-h-[80px]"
  />
  <p className="text-xs text-muted-foreground text-right">
    {customPrompt.length}/200
  </p>
</div>
```

---

## User Flow

1. User clicks **Animate** dropdown on a story
2. Modal opens showing:
   - Guidance header ("Guide the motion, not the meaning")
   - Smart suggestion pills based on story/image context
   - Optional textarea for custom instructions
   - Quality selector (720p/480p)
   - Credit cost display
3. User either:
   - Clicks a suggestion pill (populates as the instruction)
   - Types custom instruction
   - Leaves empty (uses AI auto-generation)
4. User clicks **Generate Animation**
5. Modal passes `customPrompt` (if any) to edge function

---

## Technical Changes

### 1. New Component
**File:** `src/components/topic-pipeline/AnimationInstructionsModal.tsx`

Props:
```typescript
interface AnimationInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: {
    id: string;
    headline: string;
    cover_illustration_url: string;
    cover_illustration_prompt?: string;
    tone?: string;
  };
  onAnimate: (params: {
    quality: 'standard' | 'fast';
    customPrompt?: string;
  }) => Promise<void>;
  isAnimating: boolean;
  creditBalance?: number;
  isSuperAdmin: boolean;
}
```

### 2. Edge Function Update
**File:** `supabase/functions/animate-illustration/index.ts`

Add `customPrompt` to request body:
```typescript
const { storyId, staticImageUrl, quality = 'standard', customPrompt } = await req.json();

let animationPrompt: string;
if (customPrompt?.trim()) {
  // User provided instructions - append safety constraints
  animationPrompt = `${customPrompt.trim()}, negative prompt: no camera movement, no zoom, no pan, no color changes, static camera, preserve exact source colors`;
} else if (USE_AI_PROMPTS) {
  animationPrompt = await generateAnimationPromptWithAI(...);
} else {
  animationPrompt = getContentAwareAnimationPrompt(...);
}
```

### 3. UI Integration Updates
**Files:**
- `src/components/topic-pipeline/MultiTenantStoriesList.tsx`
- `src/components/topic-pipeline/PublishedStoriesList.tsx`
- `src/components/ApprovedStoriesPanel.tsx`

Add modal state and replace direct animation trigger:
```typescript
const [animationModalStory, setAnimationModalStory] = useState<Story | null>(null);

// AnimationQualitySelector now opens modal
<AnimationQualitySelector
  onOpenModal={() => setAnimationModalStory(story)}
  isAnimating={generatingIllustrations.has(story.id)}
/>

// Modal handles the actual animation
<AnimationInstructionsModal
  isOpen={!!animationModalStory}
  onClose={() => setAnimationModalStory(null)}
  story={animationModalStory}
  onAnimate={async ({ quality, customPrompt }) => {
    await handleAnimateIllustration(animationModalStory, quality, customPrompt);
    setAnimationModalStory(null);
  }}
  isAnimating={generatingIllustrations.has(animationModalStory?.id)}
  creditBalance={credits?.credits_balance}
  isSuperAdmin={isSuperAdmin}
/>
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/components/topic-pipeline/AnimationInstructionsModal.tsx` | **Create** - New modal with guidance, pills, textarea |
| `src/components/topic-pipeline/AnimationQualitySelector.tsx` | **Modify** - Add `onOpenModal` prop option |
| `supabase/functions/animate-illustration/index.ts` | **Modify** - Accept `customPrompt`, append safety constraints |
| `src/components/topic-pipeline/MultiTenantStoriesList.tsx` | **Modify** - Add modal state, pass custom prompt to handler |
| `src/components/topic-pipeline/PublishedStoriesList.tsx` | **Modify** - Same modal integration |
| `src/components/ApprovedStoriesPanel.tsx` | **Modify** - Same modal integration |

---

## Safety Constraints

When user provides custom instructions, the edge function appends mandatory constraints:
- `no camera movement, no zoom, no pan`
- `no color changes, preserve exact source colors`
- `static camera, frozen background`

This ensures user instructions affect **motion only**, not style or composition.

---

## Considerations

- **Character limit (200)**: Keeps instructions focused and prevents prompt overflow
- **Empty state = auto mode**: If user doesn't provide instructions, AI generates them
- **Pill + custom combo**: Clicking a pill populates the textarea, user can then edit
- **Credit display**: Shows cost before confirming to prevent surprise deductions
