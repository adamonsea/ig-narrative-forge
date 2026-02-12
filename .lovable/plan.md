

# Story Card Animations: Review, Improve, and Make Optional

## Current State

The `StoryCard` component has three subtle CSS animations:
- **Image hover zoom**: `group-hover:scale-105` on the cover image (300ms)
- **Card shadow lift**: `hover:shadow-md` on the card (200ms)
- **Title colour shift**: `group-hover:text-primary` on the headline

These are lightweight and appropriate. The codebase already has a `prefers-reduced-motion` detection system in `deviceUtils.ts` and `AudioBriefingPlayer.tsx`, but it's not wired into the StoryCard or exposed as a user-facing setting.

## Changes

### 1. Add a staggered fade-in entrance animation to StoryCard grid

When the archive page loads, cards currently appear all at once. Add a subtle staggered `animate-fade-in` entrance so cards cascade in, giving the page a polished feel. Each card gets an increasing animation delay based on its grid index.

**File: `src/pages/TopicArchive.tsx`**
- Pass an `index` prop to each `StoryCard`
- Apply a staggered animation delay style

**File: `src/components/StoryCard.tsx`**
- Accept optional `index` prop
- Apply `animate-fade-in` class with a calculated delay (`index * 50ms`, capped at 400ms)
- Wrap animation classes in a `prefers-reduced-motion` check so they are skipped when the user or OS opts out

### 2. Respect `prefers-reduced-motion` on hover effects

When the OS-level "reduce motion" setting is active, disable:
- The image hover zoom (`group-hover:scale-105`)
- The fade-in entrance animation

Keep the shadow lift and text colour shift (these are non-motion visual changes and don't cause accessibility issues).

**File: `src/components/StoryCard.tsx`**
- Use a small hook or inline `window.matchMedia` check
- Conditionally omit `group-hover:scale-105` and `animate-fade-in`

### 3. Add an in-app "Reduce animations" toggle

Create a lightweight user preference stored in `localStorage` (key: `eezee_reduce_animations`) that overrides OS-level settings. This gives users explicit control without needing to change their OS settings.

**File: `src/components/NotificationPreferencesModal.tsx`** (or a new small preferences section)
- Add a "Reduce animations" toggle (Switch component) below notification preferences
- Reads/writes `localStorage` key `eezee_reduce_animations`

**File: `src/hooks/useReducedMotion.ts`** (new)
- Custom hook that checks both:
  1. OS-level `prefers-reduced-motion: reduce`
  2. localStorage `eezee_reduce_animations` flag
- Returns `true` if either is active
- Used by StoryCard and any future animated components

### 4. Wire the hook into StoryCard

**File: `src/components/StoryCard.tsx`**
- Import `useReducedMotion`
- When `true`: no entrance animation, no image hover scale
- When `false`: full animations as designed

## Technical Details

### New file: `src/hooks/useReducedMotion.ts`
```typescript
export function useReducedMotion(): boolean {
  // Check localStorage user preference
  const userPref = localStorage.getItem('eezee_reduce_animations');
  if (userPref === 'true') return true;
  // Check OS preference
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

### `src/components/StoryCard.tsx`
- Add `index?: number` to `StoryCardProps`
- Conditionally apply entrance animation and hover scale based on `useReducedMotion()`
- Entrance: `opacity-0 animate-fade-in` with `animationDelay: Math.min(index * 50, 400)ms` and `animationFillMode: forwards`
- No-motion fallback: just render statically with no animation classes

### `src/pages/TopicArchive.tsx`
- Pass `index={index}` in the `.map()` callback to `StoryCard`

### `src/components/NotificationPreferencesModal.tsx`
- Add a "Reduce animations" Switch at the bottom of the modal
- Toggle writes `eezee_reduce_animations` to localStorage

## Summary

- Staggered fade-in entrance for story cards on the archive page
- OS-level `prefers-reduced-motion` respected automatically
- In-app toggle for users who want less motion without changing OS settings
- Hover effects gracefully degrade (shadow and colour stay, zoom removed)

