# One reader definition for every dashboard number

## The rule
A **read signal** is one of these, from a real person (after the human-signal check), never from the owner, the Lovable preview, a test browser or a known bot:
- a swipe past slide 1,
- a 3-second headline stop in the feed, or
- 10 seconds or more on a story page.

Every reader number is built from read signals and nothing else:

| Number | Definition |
|---|---|
| Reading now | People with a read signal in the last 5 minutes |
| Readers (today / 7 days / 30 days) | People with a read signal in that window |
| Reads (today / 7 days / 30 days) | One person × one story × one day with a read signal |
| Per-story reads (Desk, Readership, top story, rising, milestones) | The same reads, grouped by story |
| Returning readers | Readers in the last 7 days who also had a read signal before that |
| Visits (shown separately, small, "incl. automated") | Any page load, unchanged |

A "person" is the reader ID with its prefix removed. "sv_x" and "visitor_x" are always one person. UK anonymous readers count once per page load and never as returning.

Because every number reads the same list, reading now can never be higher than today's readers, and readers can never be higher than reads.

## What changes for you
- Desk header "reading now" and the /dashboard card's "reading now" become the same number. Today one counts page loads in the last 5 minutes and the other counts engaged readers in the last hour.
- Desk per-story counts stop counting a bare story-page load as a read, so they match Readership.
- Test browsers and preview visits are left out everywhere, including the Desk.
- Headline stops start counting as reads, not just readers. This is the open question below.

## Keeping "reading now" live without a heartbeat
Headline stops are currently sent only when the reader leaves or hides the page, or after 3 minutes. The tracker will also send right after a reader's first stop, then at most once a minute while the page is visible, and only stories whose state changed. A tab left open with nothing new sends nothing and drops out after 5 minutes. No separate heartbeat is added.

## Technical details
1. **Database migration**
   - Add `last_seen_at timestamptz` to `story_impressions`, set on insert and on every upgrade in `record_story_views`. Today `created_at` keeps the first-seen time, so a later stop has no time attached.
   - `topic_engagement` also returns `at` (signal time): the interaction's `created_at`, or the impression's `last_seen_at`.
   - Add `reading_now(topic)` = `COUNT(DISTINCT vid)` from `topic_engagement(..., p_since => now() - 5 min)`.
   - `topic_reads` keeps all three signals (or two, depending on the answer below).
2. **Callers**
   - `get_topic_pulse`: `reading_now`, `reading_now_story_ids`, `story_reads`, `rising_story_id`, `reads_today` and `best_other_day_30` all read `topic_engagement`/`topic_reads` instead of its own `_pulse_reads` (swipes + bare story-page loads, raw IDs, no test or preview exclusion).
   - `get_dashboard_feed_cards`: `reading_now` comes from the same `reading_now()`.
   - `get_topic_readership` is unchanged, since it already uses `topic_reads`.
   - All three keep their existing guards.
3. **Tracker**: `headlineStopTracker.ts` adds an early flush after the first stop and a throttled flush (60 s, visible pages only, changed items only). It is still gated by `canTrackReader()` and the human signal.
4. **Tests**
   - A pure helper mirrors the SQL rule (signal → counts, prefix merge, exclusions).
   - Tests: reading now ≤ readers today ≤ reads today; sv_/visitor_ merge into one person; a test ID never counts; a bare story-page load is not a read; a 3s stop counts; an idle tab drops out after 5 minutes.
   - The SQL is verified on Eastbourne with simulated owner claims.
5. **AGENTS.md**: replace the readers/reads rule with the single definition and name `reading_now()`.
