
# Make "Publish Now" Button Visible on Story Cards

## The Problem

The "Publish Now" button is buried inside the overflow dropdown menu (three-dot menu) on Published story cards. It only appears for stories with "Scheduled" or "Ready" status. It should be a visible, prominent button in the card's action bar.

## The Fix

### File: `src/components/topic-pipeline/PublishedStoriesList.tsx`

Add a visible "Publish Now" button in the action bar (around line 524-566) for stories that are either **scheduled** or **ready** (not yet live). This mirrors the existing logic but surfaces it as a primary action.

**What gets added** (in the action bar, before the `ml-auto` trailing icons):

- A button with the Zap icon and "Publish Now" label
- Only visible when `isScheduled || isReady` (same conditions as the dropdown version)
- Shows a loading spinner when publishing is in progress (`publishingNow.has(story.id)`)
- Uses a slightly emphasized style (e.g., `variant="default"` with small size) to make it stand out as a call-to-action

**What stays the same:**

- The dropdown menu entries remain as a secondary access point (no removal needed)
- The `handlePublishNow` function is unchanged
- All other action bar buttons (View in Feed, Preview, Illustrate, Animate) stay as-is

## Technical Details

### `src/components/topic-pipeline/PublishedStoriesList.tsx` (action bar, ~line 565)

Insert before the `ml-auto` div:

```tsx
{(isScheduled || isReady) && (
  <Button
    size="sm"
    onClick={() => handlePublishNow(story.id, storyTitle)}
    disabled={publishingNow.has(story.id)}
    className="h-7 text-xs"
  >
    {publishingNow.has(story.id) ? (
      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
    ) : (
      <Zap className="w-3 h-3 mr-1" />
    )}
    Publish Now
  </Button>
)}
```

This places it as a primary-styled button alongside "View in Feed" and "Preview", making it immediately visible and actionable for stories awaiting publication.
