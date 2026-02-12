

# Remove Purple Bars + Polish Story Cards

## What's happening

You're on the topic detail page (`/dashboard/topic/eastbourne`), not the main `/dashboard` -- that's why you can't see the publish pill. It's on the overview cards. But regardless, the purple accent bars need to go, and the story cards need the product-feel treatment.

## Changes

### 1. TopicManager.tsx -- Remove purple accent bars

- Delete the 3px accent bar div entirely
- Remove `hover:border-[hsl(270,100%,68%)]/30` from the Card className
- Keep the Live/Draft pill and the `handlePublishToggle` function (these stay)

### 2. StoryCard.tsx -- Subtle product feel

Current state: plain white card, basic border, `hover:shadow-lg`. Needs warmth and polish.

Changes:
- **Background**: `bg-[#fafaf8] dark:bg-card` -- very light warm grey in light mode, standard dark card in dark mode
- **Corners**: `rounded-xl` for softer, more product-like feel
- **Hover shadow**: Soften from `hover:shadow-lg` to `hover:shadow-md`
- **No-image fallback**: When there's no cover image, add a 96px tall gradient placeholder (`bg-gradient-to-b from-muted/20 to-transparent`) so the card doesn't look broken
- **Source badge**: Remove the `ExternalLink` icon -- just show the domain name as a clean text badge
- **Border**: Soften to `border-muted/40` for less visual weight

The result: cards that feel like polished content tiles with a newsprint warmth, without adding cognitive load.

## Technical Details

### `src/components/TopicManager.tsx`
- Remove accent bar div (the 6-line block with `h-[3px]`)
- Remove `hover:border-[hsl(270,100%,68%)]/30` from Card className (keep `hover:shadow-lg`)

### `src/components/StoryCard.tsx`
- Update Card className to: `h-full rounded-xl bg-[#fafaf8] dark:bg-card border-muted/40 hover:shadow-md transition-all duration-200 overflow-hidden group`
- Add no-image fallback div before CardContent when `cover_illustration_url` is falsy
- Remove `ExternalLink` import and its usage in the source badge
- Simplify badge to just show domain text with `text-[10px]` sizing

