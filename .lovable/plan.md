# Modular core audit and plan

No code changes until you approve a phase. This is a read-only static audit.

## 1–2. Where each capability lives and how liftable it is

| Module | Lives in | Rating |
|---|---|---|
| Source ingestion | `universal-topic-scraper`, `_shared/fast-track-scraper.ts` (RSS), `scrape-whats-on` (readers, relevance, discovery) | Amber |
| Item processing | `enhanced-content-generator`, `queue-processor`, `classify-stories`, `src/lib/promptEnhancer.ts` | Red |
| Illustration | `story-illustrator`, `_shared/prompt-helpers.ts`, `_shared/illustration-gate.ts`, event category art components | Amber |
| Review pipeline | `src/lib/liveNow.ts`, `publishStory.ts`, `illustrateOnPublish.ts`, `useMultiTenantActions`, `useMultiTenantTopicPipeline`, `UnifiedContentPipeline.tsx`, `DeskEvents.tsx` | Red |
| Distribution | `send-email-newsletter`, `send-confirmation-email`, `send-story-notification`, `rss-feed`, `carouselExporter.ts`, `events/social/*` | Amber |
| Embeds | public feed hook, `widget-feed-data`, `widgetEmbed.ts` | Amber |

The pure rule files (`liveNow`, `publishStory`, `illustration-gate`, `feedCardPositions`, `eventCategories`, `briefingEvents`) are already liftable. The tangles are in the workflows that read and write the database.

## 3. The specific tangles

**Screens doing the work themselves**
- The Desk screen publishes, archives and restores stories itself (`UnifiedContentPipeline.tsx` ~267–386).
- Two hooks each change story, article and queue states their own way (`useMultiTenantActions`, `useMultiTenantTopicPipeline`).
- `DeskEvents.tsx` and `EventSources.tsx` save event and source changes directly.

**Modules doing each other's jobs**
- The writer also decides publishing, saves Instagram copy and starts tagging (`enhanced-content-generator` ~1550–1723).
- `queue-processor` makes its own auto-approve decision.
- The events reader also enforces editorial choices: kept, area confirmed, category locked, edited descriptions.
- The illustrator reads feature flags, Autopilot, topics, slides and usage directly.

**Hard-coded tenant or brand values**
- Eastbourne publisher names in `src/lib/urlUtils.ts` ~73–84 and `widget-feed-data` ~30–39.
- Eastbourne examples inside the picture instructions (`prompt-helpers.ts` ~145, 752).
- `curatr.pro` and the sender name written into email, RSS, widget and push code.
- A demo feed ID and slug in `src/lib/demoConfig.ts`.
- 72 lines mention Eastbourne; most are comments or examples, not live rules.

**Reaching across the app/server boundary**
- 8 app files import server rule files directly. This is acceptable today, but it should go through one shared entry point.

**Oversized files**
- Feed hook: 2,776 lines
- Source manager: 2,019 lines
- Writer: 1,823 lines
- Illustrator: 1,688 lines
- Pipeline hook: 1,684 lines

## 4. Phased plan (smallest, safest first)

Each phase is separate and needs your approval. No phase changes what readers or owners see.

**Phase 1: Remove hard-coded brand and tenant values (low risk)**
- Move publisher-name mappings into one data list that both app and widget read.
- Replace the Eastbourne examples in picture instructions with generic ones.
- Put the site address and sender name into one shared config used by email, RSS, widget and push.
- Test: email sample render, RSS output, widget data for Eastbourne and Lisbon, picture-rule tests.

**Phase 2: One entry point for review actions (low–medium risk)**
- Create `src/modules/review/` with `publish`, `skip/archive`, `restore`, `unpublish` and `queueForWriting`, built on the existing `liveNow`/`publishStory` rules.
- The Desk and both hooks call these instead of writing to the database themselves. Behaviour stays identical.
- Test: liveNow/publish tests plus new tests per action; on the Desk, check publish, publish without picture, skip, undo and pin; Eastbourne feed order unchanged.

**Phase 3: Event Desk and Sources actions (low risk)**
- Event publish/skip/keep/edit-description and source on/off go through `src/modules/review/events` and `src/modules/ingestion/sources`.
- Test: Event pool approve/skip, out-of-area Keep/Remove, Sources toggle, Lisbon feed.

**Phase 4: Separate writing from publishing decisions (medium risk, flagged)**
- The writer only writes and returns the story. One shared auto-publish policy decides publishing, used by both the writer and `queue-processor`. Tagging and Instagram copy become separate follow-on steps.
- Risk: Autopilot and drip-feed publishing depend on this path. Do it behind a check that the old and new decisions match on recent stories before switching.
- Test: Autopilot feed publishes as before; manual Desk publish; drip schedule; no pictures before publish.

**Phase 5: Illustration takes its settings as inputs (medium risk)**
- `story-illustrator` takes brand, style and allowed-or-not as parameters. A thin adapter reads Curatr settings, then calls the core.
- Test: picture-rule tests, one generated sample per tier, credits charged once, owner "no picture" still wins.

**Phase 6: Ingestion core vs editorial rules (medium risk)**
- The events reader returns clean events. The owner's sticky choices (kept, locked, edited, removed) are applied in one separate merge step.
- Test: gather Eastbourne, Lisbon and Brighton Centre; owner edits and removals survive a re-gather.

**Phase 7: Split the oversized files (do last, only when touched)**
- Feed hook and source manager are split along the new module lines.
- Risk: the feed hook drives the public feed. Only split it alongside other feed work, with paging and order tests first.

## Technical notes
- New code lives under `src/modules/<name>/index.ts` (app side) and `supabase/functions/_shared/<name>/` (server side). Each has one entry point with typed inputs and outputs, and never imports UI.
- Each phase adds one `AGENTS.md` rule for its module boundary.
- Not verified: quiz/extras internals, database triggers and RPC side effects, which functions are actually deployed and used.
