# Rethinking the Coverage section: places, look-up references and keywords

Today the Coverage section shows four long lists side by side — keywords, places, postcodes and organisations — each with its own add box, and each place carries a visible description box plus a photo picker that stays expanded forever. It is heavy, it looks like data entry, and it mixes two different jobs: what the feed covers, and what the illustrations should look like.

This plan splits those two jobs, automates the busywork, hides anything that isn't asking for a decision, and — critically — makes every automated suggestion **evidenced, previewable and reversible**, so the owner is always confirming with facts in front of them, never guessing.

## Two clearly separate things

**1. Picture references (visual control)**
Renamed and described as what it is: guidance so illustrations draw real buildings correctly. Places, and the photos and descriptions attached to them, live here.

**2. What the feed covers (editorial control)**
Keywords, postcodes and organisations — the terms that decide whether a story belongs. These stay in Coverage next to the news-values dial.

## Picture references

- When a place is added, its description is written automatically in the background, and reference photos are looked up automatically — no "Suggest" or "Find photos" button to press.
- The owner's only job is to confirm: they see the suggested description and a small row of found photos, and pick the ones that look right (or reject them).
- Auto-written descriptions are labelled "suggested" until the owner edits or confirms them; confirmed ones simply read as the place's note. Nothing is presented as verified when it isn't.
- Once confirmed, the place collapses to a single quiet line: name, a thumbnail, and a tick. Tapping it reopens the detail. Set-up is a one-time act, so it stops taking up space afterwards.
- Anything still awaiting confirmation floats to the top of the list; confirmed places sit beneath, minimised.
- **Reference readiness as a health signal:** the section header shows at a glance how many places have confirmed references ("3 of 5 places ready"). Places without confirmed references are exactly where illustrations are most likely to get a building wrong, so any unconfirmed place also appears once in the "Needs your attention" area on the overview — not as nagging, but as the single place to act.
- Places can also be discovered over time: when stories are approved for publishing, place names appearing in them that aren't yet on the list are gathered and offered as one-tap additions — each showing its evidence ("Seen in 4 recent stories", with the story titles on tap).
- Dismissed place suggestions are remembered and never re-offered.

## Keywords, postcodes and organisations

- Hidden by default behind a single summary line ("38 terms, 6 postcodes, 12 organisations — review"). Most owners never need to look.
- Opening it shows **suggestions first, not an empty input box**: terms that appear repeatedly in the feed's own recent history but aren't yet listed, each with its evidence — how many stories, example headlines — and a confidence feel (frequent vs occasional).
- Every suggestion is one tap to add, and one tap to dismiss forever (with undo, so a mis-dismiss is recoverable).
- An "impact preview" on each suggestion says what it would have done: "would have matched 12 stories from the last 30 days". Adding is then an informed decision, not a leap of faith.
- Same treatment for postcodes and organisations — one shared, simpler "term" pattern instead of three different-looking blocks.
- Manual add stays, but as a small secondary input rather than the headline control.

## Reversibility everywhere

- Removing a confirmed place, term or reference photo offers a brief undo, since these actions quietly change what the feed catches and how illustrations look.
- Removing a term shows what it had been catching ("removed — had matched 5 stories recently"), and those stories stay published; nothing is silently unpublished.

## New-topic nudges

A newly created topic gets one short, dismissible prompt in "Needs your attention": add a few picture references so illustrations get local buildings right. It appears only while the topic has no confirmed references and disappears once two or three are set, or once dismissed — never shown to established topics that have already dealt with it.

## How we'll know it works

- The section's own numbers tell the story: places ready vs awaiting confirmation, suggestions accepted vs dismissed, and (for terms) stories matched since adding. No new analytics plumbing — counts derived from data already on the topic and its stories.

## Technical notes

- `KeywordManager.tsx` is split into `PictureReferences.tsx` (places, descriptions, photos) and `CoverageTerms.tsx` (keywords, postcodes, organisations, shared term list component). `EditorialControlCenter` renders picture references under Voice & presentation (illustration control) and coverage terms under Coverage.
- Adding a place triggers `suggest-regional-elements` in `describe` mode and `landmark-photos` in `search` mode automatically and in parallel, writing results to a pending state; confirmation persists to `topics.landmark_descriptions` / `topics.landmark_reference_images` as now. Pending/unconfirmed state lives in component state plus a lightweight `topics.landmark_setup_state` map (per place: suggested / confirmed / dismissed) — one small schema addition.
- Suggestions (places from published stories; terms from history) come from a new read-only edge function that scans this topic's recent published stories and arrivals, counts candidate proper nouns and terms, and excludes anything already listed, negative-keyworded, or previously dismissed (dismissals stored in the same setup-state map, keeping the universal no-per-topic-hardcoding rule intact).
- Impact previews reuse existing recent-story queries; no scoring, gating or publishing behaviour changes.
- The existing `RegionalElementsSuggestionTool`, `RegionalKeywordAutoPopulate` and `KeywordSuggestionTool` blocks are folded into the single suggestion surface rather than shown as three separate tools.
- Saving stays silent-autosave with the shared Saving/Saved indicator; no success toasts.
