# Reader first visit: strip back to a cookie banner and one swipe hint

One switch, `READER_ONBOARDING_EXTRAS = false`, in `src/lib/featureFlags.ts`. No onboarding code, curator setting or stored data is deleted.

## 1. What a first-time reader meets today, in order

| # | What | Component | Trigger | How often | Curator control |
|---|---|---|---|---|---|
| 1 | Welcome card with a "Start reading / Let's go" button | `WelcomeFlashCardModal` (through `FeedOnboardingOrchestrator`) | Page load | Once per feed per browser | Yes: the welcome card setting in Onboarding settings (off by default) |
| 2 | Five tooltips, one after another, about 2s each: "New stories added…", "Filter by topic or source", "Swipe to rate stories" (only if Play mode is on), "Get notified…", "WhatsApp any story" | `OnboardingTooltip` (orchestrator) | Page load (or after the welcome card closes) | Once per feed per browser | No |
| 3 | Swipe hint on the first card | `HandSwipeHint` in `StoryCarousel.tsx:738` | 0.5s after load; disappears after 3.5s | First 3 visits per feed | No |
| 4 | A second swipe hint at the end of the tooltip chain | `HandSwipeHint forceShow` (orchestrator) | After the last tooltip | Once per feed | No |
| 5 | Cookie banner (Accept / Essential only) | `CookieConsent variant="feed"` | 0.5s after load | Until the reader chooses; asks again when the choice expires | No |
| 6 | Play-mode button pulses | `TopicFeed.tsx` 340–362 | The reader's first scroll, for 3s | Once per feed | Play mode on/off only |
| 7 | Bell button pulses | `SubscribeMenu showPulse` | Shown while the reader is still eligible for the notification prompt | Every visit until the prompt has shown once | No |
| 8 | Install card in the feed | `InlinePWACard` (placed at index 4; it opens `IOSInstallModal` on iPhone) | After 5 stories scrolled past, again at 15 and 25 | Up to 3 times, until dismissed. Only when the browser allows install, or on iPhone | No |
| 9 | Notification/newsletter pop-up | `NotificationPreferencesModal` (`TopicFeed.tsx` 408–424) | After swiping inside 2 stories, then scrolling past | Once per feed. Only when the `topic_has_active_signups` check says the feed has no active signups | No |
| 10 | End-of-feed flow (install, then notifications) | `EndOfFeedCTA` → `EndOfFeedFlow` | Reaching the end of the feed | Every time | No |

Also found: `AddToHomeScreen` isn't used on feeds, so there's nothing to change there. The Subscribe button in the header always stays. Steps 3 and 4 mean a reader can be shown the swipe hint twice.

## 2. Recommendation

**Keep:**
- **Cookie banner:** required by law, and tracking depends on the reader's choice. Make it lighter: one short line ("Cookies help us count readers."), two equal buttons and a small Learn more link. It stays the same size as now or smaller, sits at the bottom and never covers the first headline. Choices and storage don't change.
- **One swipe hint, on the first card only:** shown once per feed instead of three times, starting 1s after the cards appear (so the reader sees the content first). No text.
- **The Subscribe/bell button in the header:** it's how readers sign up on purpose. The pulse is removed.
- **End-of-feed flow:** I'm pushing back here. This is the best moment for a newsletter signup: the reader has read everything and is asking "what next?". It only shows to people who reach the end, so it adds no first-visit friction. I'd simplify it to one step with one line ("That's everything for now. Get the next ones by email.") and an email button. Install becomes a quiet secondary link.

**Remove from the first visit (behind the switch):**
- The welcome card, all five tooltips and the second swipe hint (the whole orchestrator).
- The Play-mode pulse and the bell pulse.
- The install card in the feed.
- The automatic notification pop-up mid-feed. It interrupts reading, and the end-of-feed flow and Subscribe button cover the same need.

**Effect:** a first visit becomes the feed, a light cookie bar and one silent hand gesture on card 1.

## 3. Integrity

- **Curator settings stay as they are.** The welcome card setting still saves. With the switch off, the public feed ignores it. I'll add one muted line under that setting: "Paused on public feeds."
- **Curator-side onboarding** (dashboard tours and the feed builder) isn't touched.
- **Tracking consent:** the banner keeps the same storage key, the same values and the same "Essential only" path that `canTrackReader()` reads. Only the wording and layout change.

**What could break, and how I'll check it.** All browser checks use a `zztest_` visitor code, and cleanup deletes only that code.
- **Subscriber signups:** the header Subscribe button and the end-of-feed email signup are still there. I'll open both and confirm the form appears. I won't submit a made-up address.
- **Push notifications:** the subscription code isn't changed, only the automatic pop-up. I'll check the bell menu still opens the notification options.
- **App installs:** the install card in the feed goes, but install stays in the end-of-feed flow. I'll check the link shows, and opens the instructions on an iPhone-sized screen.
- **Cookie consent gate:** in a fresh browser, choose Essential only. Then check no reader tracking or GA requests fire, and a reload doesn't show the banner again. Then repeat with Accept and check views are recorded.
- **First visit:** in a fresh phone-sized browser, take screenshots at 0s, 1.5s and 5s. Expect only the banner and one swipe hint, then nothing. On the next visit, expect no hint. Scroll 30 stories and check no install card or pop-up appears.
- **End of feed:** on a small feed, scroll to the end and check the simplified flow.
- **Tests:** run the existing tests and add one: with the switch off, the onboarding extras don't render.

## Technical details
- `featureFlags.ts`: add `READER_ONBOARDING_EXTRAS = false`.
- `TopicFeed.tsx`: gate the orchestrator, the `InlinePWACard` insert, the Play-mode pulse effect, `showPulse` on both bells and the automatic opening of `NotificationPreferencesModal`. Keep the modal mounted for manual opening.
- `HandSwipeHint.tsx`: when the switch is off, change the 3-visit limit to 1 and the delay to 1s.
- `CookieConsent.tsx`: change the feed version's wording and layout only.
- `EndOfFeedFlow.tsx`: when the switch is off, show the single email step with install as a secondary link. The full current flow returns when the switch is on.
- `OnboardingSettings.tsx`: add the muted "Paused on public feeds" note only.
- Add one AGENTS.md rule for the switch.

**Not confirmed yet:** whether `topic_has_active_signups` is per reader or per feed. If it's per feed, the mid-feed pop-up has only been showing on feeds with no subscribers. This doesn't change the plan, because the pop-up is removed either way.
