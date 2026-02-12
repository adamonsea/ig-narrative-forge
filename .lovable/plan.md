

# Inline Email Briefing Sign-Up Card in Feed

## What We're Building

A lightweight, inline email briefing sign-up card that appears between stories in the feed -- fitting naturally alongside existing interstitial cards (quizzes, sentiment, community pulse, etc.). It uses the existing `feedCardPositions.ts` registry and the proven `secure-newsletter-signup` edge function.

## How It Works

- A new `InlineEmailSignupCard` component appears at a specific position in the feed (position 9, repeating every 20 stories)
- It shows a compact card with a single email input, topic name, and a "Get the briefing" button
- On submit, it calls the existing `secure-newsletter-signup` edge function (no new backend work)
- Once subscribed, the card collapses to a small "Subscribed" confirmation and won't reappear (tracked via localStorage, matching existing pattern from `useNotificationSubscriptions`)
- Only shows if `email_subscriptions_enabled` is true for the topic

## Why Position 9, Every 20

- Position 9 avoids collisions with all existing card types (checked against the registry)
- Every 20 stories ensures it's not too frequent -- readers see it once early, then sparingly
- It sits after the PWA prompt (position 2) and before the flashback card (position 16), creating a natural engagement ladder

## Technical Details

### 1. Register position in `src/lib/feedCardPositions.ts`

Add a new entry to `FEED_CARD_POSITIONS`:
```
emailBriefing: {
  type: 'repeating',
  interval: 20,
  offset: 9,
  description: 'Email briefing sign-up prompt'
}
```

### 2. Create `src/components/feed/InlineEmailSignupCard.tsx`

A compact card component:
- Shows topic icon (if available), headline "Get the {topicName} briefing", and a brief line like "Daily or weekly -- straight to your inbox"
- Single email input + submit button, inline (not a modal)
- On success: stores subscription in localStorage (matching existing `saveSubscriptionStatus` pattern), collapses to a checkmark + "You're subscribed"
- Respects existing subscriptions: checks localStorage on mount and auto-hides if already subscribed

### 3. Wire into `src/pages/TopicFeed.tsx`

Following the exact same pattern as other cards:
- Import `shouldShowCard` for `emailBriefing`
- Check `topicMetadata?.email_subscriptions_enabled`
- Render `InlineEmailSignupCard` at the registered positions

### 4. No database, edge function, or schema changes

Everything reuses existing infrastructure:
- `secure-newsletter-signup` edge function for submission
- `saveSubscriptionStatus` from `useNotificationSubscriptions` for persistence
- `email_subscriptions_enabled` flag already on topics table
