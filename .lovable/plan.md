

# Publish Pill + Product-Feel Topic Cards

## What's changing

Two improvements to the dashboard topic cards:

### 1. One-click Publish pill on every card

The publish toggle currently only lives inside the topic dashboard header. Curators have to click into a topic just to toggle it live/offline. This adds it directly to the overview card as a small, tappable pill badge in the header row.

- **Live state**: Green pill reading "Live" -- clicking it shows a confirm dialog before unpublishing
- **Draft state**: Muted pill reading "Draft" -- clicking it publishes immediately (matching the existing `handlePublishToggle` pattern from TopicDashboard.tsx)
- Positioned next to the topic name so the publish state is instantly visible and actionable

### 2. Subtle product-feel card backgrounds

Current cards are flat white (`bg-card`) with a thin border -- functional but generic. To give each card a mini-product feel while staying low cognitive load:

- **Light top gradient strip**: A 3px-tall accent bar at the very top of each card using the brand purple (`hsl(270,100%,68%)`), fading to transparent. This is the "product label" -- like a colored tab on a physical folder.
- **Published cards**: Purple accent bar (active, branded)
- **Draft cards**: Grey accent bar (muted, clearly different state)
- **Hover state**: The existing `hover:border-purple` stays, plus a very subtle background shift to `bg-card/95` for depth

This avoids gradients on the card body itself (which would fight the stat readability) while adding just enough visual identity to make each card feel like a distinct product tile.

## Technical Details

### Files Modified

**`src/components/TopicManager.tsx`**

1. Add `Switch` import (from ui/switch) and Supabase mutation for `is_public` toggle
2. Add a `handlePublishToggle` function mirroring the one in TopicDashboard.tsx (updates `is_public` and `is_active`, with confirm dialog on unpublish)
3. In the card header row, add a clickable pill between the topic name and the action buttons:
   ```
   <button 
     onClick={togglePublish}
     className={topic.is_public 
       ? "text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium" 
       : "text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"}
   >
     {topic.is_public ? "Live" : "Draft"}
   </button>
   ```
4. Add a 3px accent bar at the top of each Card using a `before` pseudo-element or a small div:
   ```
   <div className={`h-[3px] w-full rounded-t-lg ${
     topic.is_public 
       ? 'bg-gradient-to-r from-[hsl(270,100%,68%)] to-[hsl(270,100%,68%)]/30' 
       : 'bg-muted/50'
   }`} />
   ```
5. Add local state for a confirmation dialog when unpublishing (simple `confirm()` prompt, matching existing pattern)
6. After toggling, update the topic in local state so the pill reflects immediately without refetching

### No database changes needed -- uses existing `is_public` and `is_active` columns.

## Before/After

| Element | Before | After |
|---------|--------|-------|
| Publish action | Must click into topic dashboard | One-click pill on overview card |
| Publish state visibility | Not shown on dashboard | Green "Live" or grey "Draft" pill |
| Card visual identity | Flat white, thin border | 3px colored accent bar at top |
| Published vs Draft distinction | None visible | Purple bar vs grey bar + pill color |

