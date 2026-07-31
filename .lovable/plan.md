# Scraping: observe-first, change-almost-nothing

Honest answer to your question: **no, I would not claim 100% confidence in the earlier list.** That list was an audit, not a safe change set. Several items on it (consolidating the seven scrapers, moving filters earlier, replacing the regex parser, switching schedulers) are exactly the class of change that has broken harvesting for you before. They touch the paths that decide *whether an article is seen at all*, and a regression there is silent — you don't get an error, you get fewer stories, and you notice days later.

So this plan throws most of that out. The system works. We measure first, change last.

## Principle for this work

Nothing in Phase 1 may alter which articles are discovered, fetched, kept, or scored. If a change could plausibly reduce article counts, it does not belong in Phase 1.

## Phase 1 — Instrumentation only (zero behaviour change)

The problem with the audit is that it's a list of theories. We don't know which theoretical gaps are costing you real articles. Before touching any scraping logic, make the pipeline legible.

1. **Per-stage funnel logging.** For every scrape run, record: URLs discovered, URLs fetched, extractions succeeded, articles rejected by negative keyword, articles rejected by relevance threshold, articles stored. Written to existing `system_logs` — no new decision code, only counters around code that already runs.
2. **Surface the funnel in the admin Source Health view.** You already have `SourceHealthMonitor.tsx` and `source_health_checks`. Add the funnel numbers per source so a source producing zero articles shows *which stage* dropped them.
3. **Confirm, don't assume, the two open questions.** Read-only checks: does the cron path (`universal-topic-scraper`) apply negative keywords the way `topic-aware-scraper` does, and is `getAdaptiveStrategyHint` actually called anywhere. Both are code reads, no edits.

Nothing here can reduce harvest. If Phase 1 shows the funnel is healthy across sources, we stop and do nothing else.

## Phase 2 — Only what the data justifies, one change at a time

Each candidate below ships alone, behind a per-source or per-topic flag where possible, with the Phase 1 funnel as the before/after check. If article counts drop for any source, revert that one change without touching the others.

Ordered by lowest risk:

- **Delete the fake residential-IP headers.** `X-Forwarded-For` spoofing cannot change your origin IP; this code has no effect on whether a fetch succeeds. Removing it is provably inert. Lowest-risk cleanup available.
- **Reason-aware deactivation.** Today `auto-deactivate-failing-sources` kills a source on a blunt success-rate rule while `source-health-monitor` separately knows *why* it failed. Make deactivation respect the reason code — a `feed_404` should trigger feed re-discovery, not death. This makes the system *less* likely to lose sources, not more.
- **Conditional GET (ETag / If-Modified-Since).** Purely a cost saving, but it changes fetch behaviour, so it goes one source at a time with a kill switch and the funnel watched.

## Explicitly not doing

These stay off the table unless you ask, because the risk profile is wrong for a working system:

- Consolidating the seven scraper functions. High blast radius, no article-count upside.
- Moving keyword filtering to the discovery stage. Saves money, but changes what gets fetched — the precise failure mode you described.
- Replacing regex discovery with cheerio.
- Picking one scheduler and migrating the others.
- Headless browser fallback.

Each is defensible on its own; none is worth destabilising a functioning harvest.

## Technical detail

- Funnel counters added around existing branches in `topic-aware-scraper/index.ts` (the filter loop at 168-242 already computes everything needed — it just doesn't persist the counts) and the equivalent path in `universal-topic-scraper/index.ts`.
- Storage: existing `system_logs` via `dbOps.logSystemEvent`, plus new columns on `source_health_checks` for the per-stage counts.
- Admin surface: extend `SourceHealthMonitor.tsx`; no new route.
- Phase 2 items each get their own turn and their own revert point.

## What I need from you

Confirm Phase 1 only, and I'll build the instrumentation and report back with real numbers before proposing any behavioural change.
