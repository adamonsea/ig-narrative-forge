# Headline stop rate (MVP)

## What I found
- **Story views are hardly being saved.** Today a story is only marked as "viewed" when a reader swipes into its slides, not when the headline scrolls past. Each repeat view on the same day is also rejected by the "one row per story, reader and day" rule. The table has the right shape, though: one row per feed, story, reader and day; the same shared reader code; an `is_internal` flag; and an insert rule that checks the feed and story exist and that the date is today.
- **The cookie choice is not respected by any tracking today.** The banner saves the choice (`cookie_consent` → `analytics: true/false`), but nothing reads it. Page visits, swipes, story views and Google Analytics all run whatever the reader picked. This is a gap in its own right, under UK GDPR/PECR.

## Cookie choice: recommendation
Respect "Essential only" for the stop-rate tracking from day one. I'd also apply the same rule to all reader tracking (page visits, swipes, story views and Google Analytics) in this same change, so everything behaves the same way. That would lower every reader figure slightly, by however many people choose "Essential only".
**Your call:** (a) apply it to everything, which I recommend, or (b) stop rate only, leaving the rest as is for now. I'll build (a) unless you say otherwise.

Readers who haven't answered the banner yet count as not opted out, which matches how the site behaves today. If you'd rather treat "no answer" as "no", say so.

## What I'll build

**1. Saving (database)**
- Add `paused` (true/false, default false) and `max_dwell_ms` (capped at 30,000) to the existing story views table.
- Add one small batch function, `record_story_views(topic, visitor, items[])`, where each item is a story, whether it paused, and its longest pause.
  - It checks the feed exists, the stories belong to that feed, the reader code is sensible, and caps a batch at 100 stories.
  - It always uses today's date, set by the server.
  - It adds new rows, and only ever **upgrades** existing ones: seen → paused, and a longer pause replaces a shorter one. It never downgrades.
  - The existing trigger still marks you and admins as internal.
  - **Why this approach:** it's one request per batch, and upgrading a row needs no "update" permission for the public, so readers can't edit other rows. Plain inserts can't upgrade, and opening up updates would be riskier.
- Switch the existing swipe-based view to use the same function, so the duplicate errors stop.

**2. In the feed (reader's browser)**
- One shared IntersectionObserver for every headline card, at a 60% visibility threshold. It starts after the feed has rendered, in idle time (`requestIdleCallback`, falling back to a short delay).
- When a card reaches 60%, the moment is noted as "seen" and the time stored. When it drops below 60%, or the tab is hidden, the dwell time is worked out once. 1.5 seconds or more counts as "paused", capped at 30 seconds.
- No scroll listeners, no layout reads in loops and no ticking timers. One page-visibility listener pauses every open timing at once.
- Results stay in memory. One batched send happens when the reader leaves or hides the page (`pagehide` / `visibilitychange`), using `fetch` with `keepalive`. At most one extra send happens mid-session, after 3 minutes, for long reads.
- Skipped completely for bots, when the reader chose "Essential only", and when you or an admin are signed in. The server marks those internal anyway.
- No new libraries.

**3. Figures (database, guarded)**
- The stop rate is worked out per story over the last 7 days: readers who paused ÷ readers who saw it. Internal rows are excluded, and a story needs 20 or more outside readers who saw it.
- A feed's typical stop rate is the median across its qualifying stories over the last 28 days.
- `get_dashboard_feed_cards` gains `top_stop_story_id`, `top_stop_story_title`, `top_stop_rate`, `top_stop_seen` and `median_stop_rate`. It already starts with the ownership check.
- A new `get_topic_eye_catching(topic_id)` returns the top 3 stories for the week. It starts with `can_view_topic_stats` and returns nothing otherwise.

**4. Where it shows**
- **Highlight picker:** a new "eye-catching headline" candidate (score 58) needing 20+ readers who saw it, a stop rate of 25%+, and 1.5× or more the feed's typical rate (with at least 3 qualifying stories to compare against). Copy: *"'Pier reopens' stopped 48% of scrollers — your most eye-catching headline"*. The nudge is "Share it" for that story. It's never framed negatively, and there's no low-rate copy.
- **Feed stats page:** a small "Most eye-catching this week" list on the feed dashboard next to the engagement figures, with headline and stop rate, top 3. If no story has 20+ readers who saw it, it shows "Needs a few more readers" instead.
- Tests are added to the existing highlight tests: the threshold, the comparison against typical, and a case with too few readers that shows nothing.

## Checking it doesn't slow the feed
- I'll run a Lighthouse performance check (mobile, 3 runs each) on /feed/eastbourne before and after, and compare the median Total Blocking Time, Largest Contentful Paint and Interaction to Next Paint. The aim is no change beyond normal run-to-run noise.
- I'll also take a Chrome performance trace while scrolling 30 cards, to confirm no long tasks come from the tracker and no repeated layout work.
- I'll confirm in the browser that the feed sends exactly one request on leaving, and none while scrolling.

## Why the numbers may be unreliable
- **"Essential only" readers aren't counted.** The rate is from consenting readers only.
- **Send on leave isn't guaranteed.** Some mobile browsers (iOS especially) can drop the final send when an app is killed. The mid-session send reduces this, and lost data affects seen and paused alike.
- **Position bias.** The first headline on the page gets paused on while the page loads and the reader gets their bearings. Stories near the top may look more eye-catching than they are.
- **Image and length effects.** The rate reflects the whole card (picture, headline length, slide count), not just the headline wording.
- **Small numbers.** At 20 readers, one reader moves the rate by 5 points. That's why it needs 1.5× typical before it cheers.
- **Fresh start.** Views were barely saved before, so the first week's figures will be thin.
- **Play mode and story pages** aren't counted, only the scrolling feed.

## Not included
Scroll depth, heatmaps, per-slide dwell, A/B tests, session replay.
