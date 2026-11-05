# Redesigned feed card on the dashboard

## What you'll see (top to bottom)

```text
Eastbourne  (Live)  • 2 reading now                     [View] [...]

  214  stories read this week    ▲ 18%   ▁▂▃▂▅▆▇
  ─────────────────────────────────────────────────
  [img] Council delays seafront cycle lane    64 reads
  76 subscribers (+4 this week) · 128 published · 15 sources
  Best week yet
```

1. **Header:** the feed name, the Live badge and a small pulsing green dot with "2 reading now" (readers in the last hour). The dot is hidden when the count is 0. View and the ⋯ menu stay.
2. **Hero number:** "stories read this week", in large type. Next to it:
   - the change against the previous 7 days, shown green with ▲ when up and grey with ▼ when down, never red;
   - a tiny 7-bar chart of daily reads.
   The percentage is hidden when there's nothing to compare against.
3. **Most read:** the story's picture, its headline and "64 reads". Click it to open the story. The row is hidden if nothing was read this week.
4. **One muted line:** "76 subscribers (+4 this week) · 128 published · 15 sources". Hover or tap "subscribers" to see the email, push, registered and installed split. "N in arrivals" appears at the front of this line only when it's above 0.
5. **Insight line:** at most one, and only when it's genuinely notable. The rules are listed below.

**Early state:** until a feed has 7 full days of read data, the hero area shows "Collecting your first week of readers", plus reads so far if there are any. It never shows a big zero.

**Phone width:** the hero number and chart sit above the change figure, the most-read row wraps its headline to two lines, and the muted line wraps naturally.

Styling uses the existing curatr.pro fonts and colours, with generous type. The only motion is the pulsing dot, which stays still for anyone who has reduced motion turned on.

## What each figure is based on
- **Reading now:** the existing live-readers check (last hour). Your own visits are not counted.
- **Stories read this week:** one read means one reader opened one story, counted once per day. A read comes from either:
  - swiping into a story in the feed, which is how most people read; or
  - opening the story's own page.
  The window is the last 7 days including today. Visits from the owner and admins are excluded.
- **Change %:** this week compared with the 7 days before. It's hidden when the previous week had fewer than 5 reads, so it can't show ▲∞ or a misleading jump.
- **Daily chart:** the same reads, day by day.
- **Most read:** the story with the most reads this week, with its current picture and headline.
- **Subscribers and +this week:** the same numbers as today's card, plus new sign-ups in the last 7 days.
- **Published and sources:** unchanged from today.

## Insight rules
Checked in this order; the first one that applies is shown. If none applies, no line appears.
1. **Subscriber milestone:** the total crossed 50, 100, 250, 500 or 1,000 in the last 7 days. Example: "100th subscriber this week".
2. **Best week yet:** reads this week are the highest of any 7 days on record. This needs at least 4 weeks of data and at least 20 reads.
3. **Referral spotlight:** one outside site sent 10 or more readers this week. Example: "eastbourneunltd.co.uk sent 30 readers".
4. **Big jump:** reads are up 50% or more, with at least 20 reads this week. Example: "Reads up 64% on last week".
5. **Top story:** a single story got 40% or more of the week's reads, with at least 10 reads. Example: "One story drove 45% of reads".

## What we can't measure reliably yet
- **Story reads in the feed** have been saving reliably for about a month. The early-state message covers any feed without 7 days of data.
- **Story-page opens** were mostly lost before today's fix. Older weeks undercount them, so early "Best week yet" and % comparisons lean on feed swipes.
- **Owner exclusion for in-feed reads** works by matching the browser IDs already marked as internal. If an owner reads their feed on a browser that never opened the dashboard, those reads could still count.
- **Referral sources** depend on the referring site passing its address. Many apps, such as email and WhatsApp, don't, so those visits show as direct.

## Technical notes
- There will be one new database function, `get_dashboard_feed_cards(p_user_id)`, which returns one row per feed the user owns that isn't archived.
- It starts with the same permission check as the other stats functions and returns nothing to anyone but the owner or an admin.
- Only signed-in users can call it. Signed-out visitors are refused.
- Fields returned:
  - readers in the last hour
  - reads this week and in the previous 7 days
  - an array of 7 daily read counts
  - the date of the first read
  - the most-read story: id, slug, title, image, reads
  - subscribers in total and in the last 7 days, plus the email, push, registered and installed breakdown
  - published this week, sources and arrivals
  - the chosen insight: type and text
- "Reads" come from a union of:
  - `story_interactions` swipe rows, deduplicated by visitor, story and day;
  - `site_visits` story rows, deduplicated the same way.
  Visitor IDs flagged internal on that topic are excluded.
- On the front end, the card section of the feed list is replaced by a new `FeedStatsCard` component that calls this one function. It shows a skeleton while loading and has no extra requests.
- The old dashboard stats call stays for anything else that uses it.
- Isolation will be tested the same way as last time: a throwaway second account gets nothing back, and signed-out callers are refused.
- I'll check the layout at desktop and phone widths in the browser.
