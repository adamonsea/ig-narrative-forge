# Cheaper images (without stale news) + tighter duplicate control

Two pieces of work: cut the image bill without slowing fresh news down, and catch the same story arriving from several sources so only one copy sits in the queue by default.

## Part 1 — Image cost

Your concern about the 24-hour batch wait is right for a news feed, so batching is used only where nothing is waiting on it.

**Fresh stories stay instant.** Anything a person illustrates from the dashboard, and anything published within the last 24 hours, keeps generating immediately at full speed. No change to how that feels.

**Batch is used only for catch-up.** The automated job currently sweeps up to 7 days of un-illustrated stories. Stories older than 24 hours in that sweep go through the discounted route instead — they're already old, so a few hours' wait costs nothing. Every batch job is polled and the image is attached to the story as soon as it lands; if the batch route fails or is unavailable, that story falls back to the normal immediate route (no story is ever left without an image because of this).

**Quality tier rebalance.** Automated illustrations default to the mid tier rather than the top tier — visually near-identical for the illustrated style you use, at roughly half the price. The top tier stays available as an explicit choice for photographic or text-heavy stories.

**Regeneration caps.** Repeat regenerations were about 40% of your image spend. Each story gets a soft cap (default 3 regenerations) with a clear message when it's reached; the product-owner account can override. A per-topic spend figure is shown in the dashboard so a runaway feed is visible early.

Expected effect: roughly half the current image bill, with no added wait on anything a reader or you would notice.

## Part 2 — Duplicate stories from different sources

Today duplicates are only spotted in Arrivals, by comparing title words at a 0.7 overlap, and both copies stay fully visible.

**Tighter matching.** Matching gains two extra signals alongside title overlap: numbers and proper nouns shared between headlines (names, places, figures — the things that actually identify a story), and a publication-time window so unrelated stories months apart aren't paired. Matching stays scoped to a single feed.

**One copy shown by default.** The oldest copy in a group becomes the visible one. The others are collapsed out of the list behind a "2 similar from other sources" control on the leader — one click expands them, and each can be kept, discarded, or promoted to leader. Nothing is deleted automatically.

**Also applied at approval time.** Before a story is approved, a check runs for an already-approved story matching the same group; if found, the approval warns rather than silently creating a second published copy.

A "Show duplicates" toggle keeps the old behaviour available for when you want to see everything.

## Technical notes

- `supabase/functions/auto-illustrate-stories/index.ts`: split eligible stories into `fresh` (<24h, immediate) and `backlog` (>24h, batch); submit batch jobs and record job ids on the story row; a scheduled poller attaches results and falls back to immediate generation on batch failure or expiry.
- `supabase/functions/story-illustrator/index.ts`: default automated model moves from `gpt-image-1.5-high` usage to `gpt-image-1.5-medium`; add a `useBatch` flag routing to the batch endpoint.
- Regeneration cap: count existing illustration rows per story before generating; enforce limit, bypass for the product-owner account.
- `src/lib/titleSimilarity.ts`: add entity/number overlap scoring and a time-window guard to `detectDuplicateGroups`; return collapsed-member info.
- `src/components/topic-pipeline/MultiTenantArticlesList.tsx`: collapse non-leader members behind an expander with keep / discard / promote actions and a global "Show duplicates" toggle.
- Approval path: duplicate-group check before approve, warning dialog on match.
- No schema changes beyond a nullable batch-job column on stories and a regeneration counter.
