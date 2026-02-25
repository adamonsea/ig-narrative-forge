## Improving Parliamentary Content: Validation, Interaction, and Publishing

### Current State Summary

The parliamentary feature currently has three output formats:

1. **Full story carousels** -- 5-slide stories created for "major" votes, now landing as `status: 'ready'` (post-audit fix)
2. **ParliamentaryInsightCard** -- major vote cards injected into the feed at position 8, 21, 34...
3. **ParliamentaryDigestCard** -- a single weekly digest card at position 25, showing up to 15 minor votes in a paginated list
4. **VotingRecordPanel** -- a raw admin table in the dashboard showing all collected votes with filters

The topic owner's interaction points are:

- Toggle tracking on/off
- Test Daily / Test Weekly buttons
- Toggle `is_major_vote` star on individual votes in VotingRecordPanel
- Manage tracked MPs

### Problems

1. **No editorial preview before publish.** The owner can star/unstar votes as "major" but can't preview how they'll look in the feed before they go live as insight cards or digest entries. There's no approval step for the card content itself.
2. **Major vote classification is fragile.** It's auto-detected by the collector (rebellion, close margin, high relevance score) and then manually adjustable via a tiny star button in a dense admin table. The owner has no clear way to understand *why* something was marked major.
3. **Three separate rendering paths = inconsistent quality.** A "major" vote can appear as both a full story carousel AND an insight card in the same feed. There's no deduplication logic between story-based and card-based parliamentary content.
4. **The digest card is buried and static.** Position 25 means most readers never scroll far enough. It's a paginated table inside a card -- not engaging, not swipeable, not shareable.
5. **VotingRecordPanel is developer-facing.** Dense data table with raw fields. Not useful for a non-technical topic curator.

---

### Proposed Improvements

#### A. Simplify the Dashboard Validation UX

**Replace VotingRecordPanel with a curated "Parliamentary Review" panel.**

Instead of a raw data table, show:

- A clean list of this week's collected votes, grouped by date
- Each vote shows: title, MP name, Aye/No badge, category pill, and a one-line local impact summary
- A single toggle per vote: "Feature in feed" (replaces the confusing `is_major_vote` star)
- A preview button that opens the vote rendered exactly as it would appear in the ParliamentaryInsightCard
- Remove the filters/sort complexity -- just show recent votes chronologically

This gives the curator a clear, simple question per vote: "Do I want readers to see this?"

#### B. Eliminate the Story Carousel for Parliamentary Votes

Parliamentary vote stories (the 5-slide carousels) are the root cause of pipeline pollution and self-publishing issues. They duplicate what the insight cards already do, but worse -- they require illustration, go through drip feed, and compete with editorial content.

**Proposal:** Stop creating `stories` and `slides` rows for parliamentary votes entirely. Instead:

- Major votes appear exclusively as `ParliamentaryInsightCard` in the feed
- Minor votes appear exclusively in the `ParliamentaryDigestCard`
- The `uk-parliament-collector` stores data only in `parliamentary_mentions` -- no `topic_articles`, no `stories`, no `slides`

This completely ring-fences parliamentary content from the editorial pipeline.

#### C. Make the Feed Cards More Engaging (while maintianing low congnitive load ethic)

**ParliamentaryInsightCard (major votes):**

- Make it swipeable (2-3 mini-slides within the card): Slide 1 = vote title + MP. Slide 2 = result + tally. Slide 3 = local impact + link to Parliament.uk
- Add a "How did your MP vote?" hook as the card header to increase engagement
- Add share button (same pattern as story share)

**ParliamentaryDigestCard (weekly minor votes):**

- Rename to "This Week in Parliament" with a clearer framing
- Move from position 25 (too deep) to position 10-12 range
- Collapse to show top 3 votes with an "See all X votes" expand -- not paginated dots
- Add a summary line at the top: "Your MP voted X times this week. 2 rebellions."

#### D. Add a Weekly Digest Email Option

If email subscriptions are enabled for a topic, include a "Parliamentary Week" section in the email briefing -- a compact summary of votes, formatted for email. This uses existing email infrastructure but adds parliamentary data as a section rather than a separate story.

---

### Implementation Plan (Prioritized)


| Priority | Change                                                                                                             | Files                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1        | Stop creating stories/slides for parliamentary votes in collector. Store in `parliamentary_mentions` only.         | `uk-parliament-collector/index.ts`                                                         |
| 2        | Remove story-creation functions (`createDailyVoteStory`, `createWeeklyRoundup` story parts). Keep mention storage. | `uk-parliament-collector/index.ts`                                                         |
| 3        | Simplify VotingRecordPanel into a "Parliamentary Review" panel with toggle + preview per vote                      | `src/components/VotingRecordPanel.tsx`                                                     |
| 4        | Add swipeable mini-carousel to ParliamentaryInsightCard (2-3 slides within the card)                               | `src/components/ParliamentaryInsightCard.tsx`                                              |
| 5        | Redesign ParliamentaryDigestCard as "This Week in Parliament" with summary + expandable list                       | `src/components/ParliamentaryDigestCard.tsx`                                               |
| 6        | Move digest card position from 25 to 12                                                                            | `src/lib/feedCardPositions.ts`                                                             |
| 7        | Remove parliamentary story rendering path from StoryCarousel                                                       | `src/components/StoryCarousel.tsx` (remove ~150 lines of parliamentary-specific rendering) |
| 8        | Clean up: remove `parliamentary-weekly-backfill` edge function (no longer creates stories)                         | `supabase/functions/parliamentary-weekly-backfill/`                                        |


### Result

- Parliamentary content is fully separated from the editorial pipeline -- no shared tables, no shared automation
- Topic owners get a simple "feature this vote / don't" toggle with preview
- Readers get more engaging, scannable parliamentary cards instead of awkward 5-slide carousels
- The on/off toggle genuinely controls everything -- no leaked stories, no orphaned records