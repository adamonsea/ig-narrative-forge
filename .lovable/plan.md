# Engagement metrics (first-party, anonymous)

Phase 0: the reader-definition fix is published first. Its database part is already live; the faster headline-stop sending goes live when you publish. Building starts after that.

## Event list and where each is stored

| Signal | What counts | Stored in | New? |
|---|---|---|---|
| Stop rate | 3s+ headline stop, position-corrected | `story_impressions` → `story_stop_scores` | Existing |
| Read-through | The reader reached the story's last slide, as shown on screen | `story_interactions`, type `read_through` | New type, same recorder |
| Source clicks | Tap through to the original article | `story_interactions`, type `source_click` | Existing |
| Stories seen per visit | Headlines 60%+ in view, per person per day | `story_impressions` (seen rows) | Existing |
| Returning readers | A reader on 2+ different days within 7 days | `topic_engagement` across days | Existing rule, needs a kept ID (see questions) |
| Sign-ups | New verified email or notification sign-ups this week | `topic_newsletter_signups` (count only, never linked to a reader) | Existing |
| Shares | Share button or WhatsApp | `story_interactions`, type `share_click` | Existing |
| Event clicks out | "Tickets & info" vs "More info" taps | `event_clicks` + new `kind` column (`tickets` / `details`) | New column |
| Add to calendar | Reader saves the event to their calendar | `event_clicks`, kind `calendar` | New: the button doesn't exist yet. One quiet "Add to calendar" on the event card's second slide, making a calendar file on the phone (no outside service) |

Every row comes from the existing reader trackers, so it follows the regional rules (UK anonymous, EU per your answer, rest counted unless opted out, Global Privacy Control = never). No third-party tool is added.

## How bots and owners are kept out
Every signal goes through the same filters as the reader definition:
1. **Browser:** nothing is sent until a real person touches, scrolls or types. Automated browsers and known bot names send nothing (`canTrackReader`).
2. **Owner:** anything sent while signed in is marked internal by the database. The owner's own event clicks are skipped when they're recorded.
3. **When figures are read:** everything also passes `topic_excluded_visitors` (any browser ever used by the owner, plus the Lovable preview) and `is_test_visitor`. Sign-ups also drop the owner's own email and unverified addresses.
4. A click counts from the same people a read would. It doesn't need an earlier swipe, because a tap is itself a human action.

## Readership: three lines
Same Readership design, numbers count up, no new charts.
1. **"18 readers this week · 5 came back"**
2. **Best stories:** the top 3 by stop rate, each with its source clicks. Below the 30-reader story floor (Eastbourne today), this shows the most-read stories with their source clicks, labelled as reads, never as rates.
3. **"Sent to sources: 42"**: story source clicks plus event clicks out (tooltip splits stories, tickets, details, calendar).

Tapping a story opens the drawer with:
- seen,
- stop rate,
- read-through,
- source clicks,
- shares.

Feed-level detail sits in a quiet fold under the three lines:
- stories seen per visit,
- sign-ups,
- shares.

**Simplified:** the current hero card, stopper line, venue-clicks line and funnel leave the main view. They're folded into the three lines or the drawer.

## Phases
1. **Capture**
   - `read_through` from the carousel when the last shown slide is reached.
   - `kind` on event clicks.
   - Add to calendar button and calendar file.
   - Tests that each one obeys `canTrackReader`.
2. **Figures**
   - Extend the guarded `get_topic_readership`: readers/returning, best stories, sent to sources, per-story detail and feed fold, all from `topic_engagement` exclusions.
   - Pure rules (best-story pick, floor fallback, celebratory wording) in `src/lib/readerStats.ts` with tests.
3. **Screen**
   - Add the three-line block, drawer detail rows and fold to `/design` first, then the Readership tab.
   - Check Eastbourne and Lisbon on desktop and phone.
4. **Notice**
   - Privacy and cookie pages list each signal in plain words, with the opt-out (UK) and the consent rule (EU).
   - AGENTS.md rule for the metric list.

## Technical details
- `event_clicks`: add `kind text not null default 'details'` (validated by trigger), `record_event_click(p_event_id, p_visitor_id, p_kind)`. The old two-argument call keeps working.
- `record_story_interaction` already accepts any type ≤ 50 chars. `read_through` is sent once per story per page load.
- Calendar file: built in the browser from the event's own title, start/end, venue and link, with no outside service.
- "Visit" = person × day; anonymous IDs are per page load already. Median stories seen per visit is shown only with 5+ visits.
- Figures never padded; zero states read "No readers yet this week".
