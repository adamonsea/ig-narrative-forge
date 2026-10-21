# Satirical cartoons as a picture style

## What you'll get
1. **New feed-wide style: "Satirical cartoon"**. It sits alongside the six current styles in Editorial Control, so a feed can use it as its default.
2. **Style per story in Arrivals**. The picture button gets a small style menu showing all seven styles, set to the feed's default. You choose a style for this one story and generate it. Nothing about the feed default changes.
3. **The same menu on published stories** when you regenerate a picture, so you can swap one story to satire (or back) after it's live.
4. **Satire always uses Sunburst medium**. It doesn't matter which quality tier is chosen.
5. **Tragedy safeguard**: if the joke writer rejects a story as unsuitable (deaths, abuse, serious harm), that story gets a picture in the feed's standard style and you see a short note explaining why. The existing anonymity guard still applies first.
6. **Joke visible to editors**: the joke line from the writer is saved with the story and shown under the picture in the pipeline. It is never printed on the image, so you can see what the cartoon is getting at.

## Credits (50% margin rule)
- Satirical picture = Sunburst medium cost + joke-writer cost, × 2. This will likely land around **6 credits**. I'll confirm the exact figure from the real cost before going live.
- The picture is shown as a premium style, like the other non-standard styles.

## Automation
- With auto-illustrate or holiday mode on a satirical-default feed, each image uses the full joke-then-draw process. If the joke is rejected, it falls back to the standard style automatically, with no extra charge.

## Technical section
- Add `satirical` to `ILLUSTRATION_STYLES` (labels and descriptions) and update the `illustration_style_valid` check constraint on `topics` in a migration.
- `story-illustrator`: accept an optional `styleOverride` param. When the style is satirical, call `generateSatiricalGag` and then `buildSatiricalPrompt` (shared with the bench), force the model to `gpt-image-2.5-sunburst-medium`, skip house reference covers, and fall back to the topic's standard style when the gag is null.
- Store the gag on the story (a new nullable `stories.illustration_gag` jsonb: target/irony/gag/scene).
- UI: a shared `StyleOverrideMenu` used in `MultiTenantStoriesList` (Arrivals) and `PublishedStoriesList` (regenerate). The topic default comes from `topics.illustration_style`.
- Add a credit rate entry for satirical, and do the auto-illustrate pass-through without the override (it uses the topic default).
- Also update owner-assistant style knowledge and the onboarding style picker.

## Verification
- Deploy `story-illustrator`, then run one test generation per path (topic default, Arrivals override, published regenerate, gag-declined fallback) through the function directly. Signed-in UI clicks can't be tested here, so you'll need to try one in Arrivals yourself.
