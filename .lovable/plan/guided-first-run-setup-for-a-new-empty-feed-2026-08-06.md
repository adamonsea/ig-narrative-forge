# Guided first-run setup for a new, empty feed

A brand-new topic currently drops the owner onto the full dashboard with two tabs and a long settings page. There is no guidance, so an empty feed with no sources stays empty. This adds a focused, step-by-step setup guide that takes an owner from "empty feed" to "first stories arriving" — one decision per screen, with a short "why this matters" line at each step.

## What the user sees

When a topic has no sources and no articles, the dashboard replaces its usual content with a single centred setup card. Everything else (tabs, settings, pipeline) stays available behind a "Skip setup" link, so nothing is taken away.

Steps, one at a time, with a slim progress indicator (Step 2 of 5):

1. **Add your sources** — the existing source finder / add-source flow, embedded. Why: "Your feed only sees what your sources publish. Three to five good ones is plenty to start."
2. **Confirm what counts** — keywords for the topic (or the town/region for local feeds). Why: "We use these to decide which stories belong in your feed and which get filtered out."
3. **Rule things out** — negative keywords and competing towns, easy to skip. Why: "Stops near-miss stories from other places or subjects clogging your queue."
4. **Pick your voice** — tone and writing style only, one choice each. Why: "Every story is rewritten in this voice before it reaches your readers."
5. **Choose how stories publish** — a single either/or: review each story yourself, or let good ones publish automatically. Why: the trade-off in one sentence.

Finish step: a "Gather first stories" button that runs the existing gather, shows the existing waiting animation, and lands the owner on their arrivals with a one-line note on what to do next. If gathering returns nothing, the card offers "Add more sources" rather than a dead end.

Deliberately excluded from the guide (still reachable in Settings): branding, onboarding cards, widgets, RSS, email, audio, donations, community voice, parliamentary tracking, sentiment, drip feed, illustration style.

Once completed or skipped, the guide does not reappear; a small "Finish setup" chip stays on the dashboard while sources or keywords are still missing.

## Technical notes

- New `src/components/onboarding/FeedSetupGuide.tsx` — step machine, progress header, per-step "why" copy, Back/Next, Skip.
- Step bodies reuse existing components rather than duplicating logic: `TopicAwareSourceManager`, `KeywordManager`, `TopicNegativeKeywords` + `TopicCompetingRegions`, a trimmed subset of `ContentVoiceSettings` (tone + writing style), and the automation toggle from `TopicAutomationSettings`.
- Gating in `src/pages/TopicDashboard.tsx`: render the guide when the topic is owned by the current user and `stats.sources === 0 && stats.articles === 0 && stats.stories === 0`, unless dismissed.
- Progress and dismissal persisted per topic in `localStorage` (`feed_setup_${topic.id}`) — no schema change; each step writes its real setting through the existing components, so nothing is lost if the guide is abandoned.
- Waiting states reuse `WaitingAnimations.tsx` (`SourceScanLoop`, `ClippingStackLoop`).
- Keyboard accessible, `min-h-dvh` wrapper, semantic headings, one decision visible per screen.