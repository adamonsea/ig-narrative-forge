

# Dashboard Stats -- Clarity and Accuracy Fix

## The Problem

The "Subscribers: 76 total" metric for Eastbourne is technically correct but deeply misleading. It sums four unrelated audience types into one number:

- 6 homescreen installs (PWA users)
- 7 play mode registrants (interactive users)
- 9 email newsletter subscribers
- 54 push notification subscribers

A curator seeing "76 subscribers" thinks they have 76 email subscribers. They don't -- they have 9. The aggregated number hides the actual composition and makes it impossible to know which audience channels are working.

Additionally, the RPC doesn't return `visits_last_week`, so the WoW% always shows 0% -- the trend indicator is broken.

## Design: What Curators Actually Need

For building audience, a curator needs to answer three questions at a glance:

1. **"Is anyone coming?"** -- Visitors this week + trend direction
2. **"Are they engaging?"** -- Do visitors interact with stories?
3. **"Are they subscribing?"** -- Are visitors converting to recurring audience?

The third question requires clarity on *how* they're subscribing, not a blended total.

## Changes

### 1. Replace "Subscribers" Column with Breakdown

Instead of one blended number, show the subscriber types individually with tiny labels:

```text
Audience
9 email · 54 push · 7 registered · 6 installed
```

This is a single line of text that tells the curator exactly what their audience looks like. On mobile, it wraps naturally.

If all values are zero, show "No subscribers yet".

### 2. Fix WoW% (Visitors Trend)

The `get_user_dashboard_stats` RPC doesn't return `visits_last_week`. The code reads it but it's always undefined, so WoW% is always 0%.

**Fix:** Add `visits_last_week` to the RPC function by querying `site_visits` for the previous 7-day window. This makes the trend indicator actually work.

### 3. Rename "Engagement" to "Approval"

"Engagement" is vague. The number shown is specifically the approval rate (liked / (liked + disliked)). Call it what it is: "Approval" with the percentage, and "avg stories engaged" as the subtitle.

### 4. Add Subtle Tooltips Back (Selectively)

The previous simplification removed all tooltips. But three specific labels genuinely benefit from a one-line explanation for new users:

- **Visitors**: "Unique visitors to your feed this week"
- **Approval**: "% of stories readers swiped right on"
- **Audience**: "People subscribed to your feed updates"

Use the native `title` attribute (browser tooltip) rather than Radix Tooltip components -- zero JS overhead, appears on hover, invisible otherwise.

## Technical Details

### Files Modified

**1. `src/components/TopicManager.tsx`**
- Replace `getTotalSubscribers()` with an inline audience breakdown string
- Rename "Engagement" label to "Approval"  
- Rename "Subscribers" label to "Audience"
- Add `title` attributes to the 3 stat labels
- Read `visits_last_week` from the stats (will work once RPC is updated)

**2. Database Migration: Update `get_user_dashboard_stats` RPC**
- Add a `visits_last_week` output column
- Query `site_visits` for `created_at` between 14 days ago and 7 days ago, same logic as `visits_this_week` but offset by one week
- This fixes the WoW% trend that currently always shows 0%

### No new components or files needed.

## Before/After

| Element | Before | After |
|---------|--------|-------|
| Subscribers display | "76 total" (meaningless aggregate) | "9 email . 54 push . 7 registered . 6 installed" |
| Engagement label | "Engagement" (vague) | "Approval" (specific) |
| WoW trend | Always 0% (broken) | Actual week-over-week change |
| Tooltips | None | Native `title` on 3 labels only |
| Zero-subscriber state | "0 total" | "No subscribers yet" |

