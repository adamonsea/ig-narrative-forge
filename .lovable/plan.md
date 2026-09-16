# Rethinking the Coverage section: places, look-up references and keywords

Today the Coverage section shows four long lists side by side — keywords, places, postcodes and organisations — each with its own add box, and each place carries a visible description box plus a photo picker that stays expanded forever. It is heavy, it looks like data entry, and it mixes two different jobs: what the feed covers, and what the illustrations should look like.

This plan splits those two jobs, automates the busywork, and hides anything that isn't asking for a decision.

## Two clearly separate things

**1. Picture references (visual control)**
Renamed and described as what it is: guidance so illustrations draw real buildings correctly. Places, and the photos and descriptions attached to them, live here.

**2. What the feed covers (editorial control)**
Keywords, postcodes and organisations — the terms that decide whether a story belongs. These stay in Coverage next to the news-values dial.

## Picture references

- When a place is added, its description is written automatically in the background, and reference photos are looked up automatically — no "Suggest" or "Find photos" button to press.
- The owner's only job is to confirm: they see the suggested description and a small row of found photos, and pick the ones that look right (or reject them).
- Once confirmed, the place collapses to a single quiet line: name, a thumbnail, and a tick. Tapping it reopens the detail. Set-up is a one-time act, so it stops taking up space afterwards.
- Anything still awaiting confirmation floats to the top of the list; confirmed places sit beneath, minimised.
- Places can also be discovered over time: when stories are approved for publishing, place names appearing in them that aren't yet on the list are gathered and offered as one-tap additions ("Seen in 4 recent stories — add?").

## Keywords, postcodes and organisations

- Hidden by default behind a single summary line ("38 terms, 6 postcodes, 12 organisations — review"). Most owners never need to look.
- Opening it shows the lists, but the first thing shown is **suggestions**, not an empty input box: terms that appear repeatedly in the feed's own recent history but aren't yet listed, offered as one-tap additions, with the number of stories each was seen in.
- Same treatment for postcodes and organisations — they use one shared, simpler "term" pattern instead of three different-looking blocks.
- Manual add stays, but as a small secondary input rather than the headline control.

## New-topic nudges

A newly created topic gets a short, dismissible prompt in the "Needs your attention" area of the control centre: add a few picture references so illustrations get local buildings right. It appears only while the topic has no confirmed references and disappears once two or three are set, or once dismissed.

## Technical notes

- `KeywordManager.tsx` is split into `PictureReferences.tsx` (places, descriptions, photos) and `CoverageTerms.tsx` (keywords, postcodes, organisations, shared term list component). `EditorialControlCenter` renders picture references under Voice & presentation (illustration control) and coverage terms under Coverage.
- Adding a place triggers `suggest-regional-elements` in `describe` mode and `landmark-photos` in `search` mode automatically and in parallel, writing results to a pending state; confirmation persists to `topics.landmark_descriptions` / `topics.landmark_reference_images` as now. No schema change needed — confirmation is implied by the saved value.
- Suggested places from published stories and suggested keywords from history come from a new read-only edge function that scans this topic's recent published stories and arrivals, counts candidate proper nouns and terms, and excludes anything already listed or in negative keywords. Suggestions are computed on open and cached in component state.
- The existing `RegionalElementsSuggestionTool`, `RegionalKeywordAutoPopulate` and `KeywordSuggestionTool` blocks are folded into the single suggestion surface rather than shown as three separate tools.
- Saving stays silent-autosave with the shared Saving/Saved indicator; no success toasts. Scoring, gating and publishing behaviour are unchanged.
