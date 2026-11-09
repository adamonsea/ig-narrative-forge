# Feed fixes: three small, isolated changes

Nothing gets published. Each fix is checked on its own before moving to the next.

## Fix 1: Remove the unused first-card watcher (StoryCarousel.tsx)

**What changes:** `src/components/StoryCarousel.tsx` only. Delete the `isFirstCard` state (line 176) and the effect that sets it (around lines 402–416). That effect runs `document.querySelectorAll` and a body-wide `MutationObserver` on every card. Nothing reads `isFirstCard` (I searched for it and it's only declared and set).

**Confirmed:** `shouldUseVideo` (line 168) is computed but never used. I'm leaving it alone as you asked.

**Where StoryCarousel is used:** the feed (TopicFeed), story pages (StoryPage), daily and weekly roundups (DailyRoundupList, WeeklyRoundupList). The archived RoundupCarousel only mentions it in a file that isn't used. It doesn't touch the Desk, Readership, the widget, emails or any stats.

**What could break:** almost nothing, since no other code reads the value. The feed's headline tracker and the old view tracker use their own refs, not the `data-story-card` lookup.

**How I'll check:** search for zero remaining `isFirstCard` references; confirm the build passes; open the feed, a story page and a roundup in the preview and check that cards render, swipe, and that the browser console shows no errors.

## Fix 2: Remove the "settling" transition (carousel)

**What changes:**
- `src/index.css`: delete the `.embla-container-smooth.is-settling` rule (lines 102–104). The base `.embla-container-smooth` rule stays.
- `src/components/ui/embla-slide-carousel.tsx`: delete the `isSettling` state, the `onSettle` and `onScroll` handlers, their `settle`/`scroll` subscriptions and unsubscriptions, and the `is-settling` class. The `select`/`reInit` listeners, index syncing and everything else stay as they are.

**Where this is used:** every slide carousel built on `EmblaSlideCarousel`: StoryCarousel (feed, story pages, roundups), plus CommunityPulseSlides, SentimentCard and AutomatedInsightCard inside the feed. The widget and emails don't use it, and neither does Play/swipe mode, which has its own gesture system.

**What could break:** slide position and dot updates depend only on `select`, which stays. The risk is a visible change to how swipes feel, and that change is the point of the fix.

**How I'll check:** build passes; in the preview at phone size, swipe through slides on a feed card, a story page and an insight card. Check that each lands on its slide, the dots/index update, and the console shows no errors.

## Fix 3: Allow source clicks to be saved

**What changes:** one additive database change. Replace the `story_interactions_interaction_type_check` constraint with the same list plus `'source_click'`: swipe, share_click, donation_button_clicked, donation_modal_opened, donation_tier_clicked, source_click. Nothing is removed. No code changes: `trackSourceClick` (useStoryInteractionTracking, called from StoryCarousel's source link) and `record_story_interaction` already send and accept it.

**Stats functions that read story_interactions:**
- **Already only count swipes, so a source click changes nothing:** `get_topic_readership`, `get_widget_social_proof`, `get_popular_stories_by_period`, and the reads parts of `get_dashboard_feed_cards` and `get_topic_pulse`.
- **Already expect source clicks** (they've shown 0 until now and will start showing real numbers): `get_topic_engagement_funnel` (Readership funnel, "source clicks"), `_impl_topic_engagement_averages`, `_impl_user_dashboard_stats` (`source_clicks`).
- **Count every interaction type together** (you were right about `count_topic_visitors`):
  - `count_topic_visitors`: distinct readers across all four tracking tables. It only goes up if a click comes from a browser with no other tracked activity in that period. In practice that browser will already have a visit or a headline view, so the figure should barely move.
  - "Reading now" on the dashboard card (last hour) and the Desk pulse (last 5 minutes): any interaction counts. A reader who clicks a source would already be counted, so no real change.
  - `_impl_topic_interaction_stats` and one total in `_impl_topic_engagement_averages`: total interactions will rise by the number of source clicks.

**Does the curator see a change?** Yes, but only where it's intended: the Readership funnel's source-clicks step stops reading 0. The Readers figure and "reading now" could only move in an edge case. Reads, top stories, headline scores and the widget shelf won't change.

**What could break:** nothing that writes today, because a constraint that allows more values can't reject anything it accepted before. Replacing the constraint briefly locks the table, but it's small.

**How I'll check:** read back the constraint; in a test that's thrown away afterwards, record one `source_click` through `record_story_interaction` and confirm it saves. Then click a source link in the preview and confirm a real row appears and is not marked as an internal visit (assuming I'm not signed in).

## Order
Fix 3 (database) first, then 1, then 2, checking each before the next. Nothing published.
