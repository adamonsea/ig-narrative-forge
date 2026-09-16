# Better news judgement for local feeds

## The problem today

Scoring is one big sum with no gate in front of it. An article that never names your area can still reach 100:

- Five everyday keyword hits (crime, police, fire, community, hospital): +50
- A "trust the source" bonus given *because* no place name was found: +25
- A national-story bonus: +15
- Then a source-type multiplier, capped at 100

So generic words count the same as real places, and naming nowhere is rewarded. Separately, the nearby-town idea barely exists: there is a per-category "radius in miles" number, but it is only checked against a fixed value of 25 to decide whether to skip the place check entirely. Neighbouring towns are not a concept the owner can express. The "competing regions" list you can edit is written to the database but never actually read when scoring.

## What we'll build

### 1. A place gate before any scoring

An article must first be tied to a place. Three outcomes:

- **Home** — names your town, a landmark, a postcode or a named organisation. Full score.
- **Nearby** — names one of the places you listed as neighbouring. Scored, then reduced by how far you marked it.
- **Nowhere** — names no place you recognise. Capped low; can only pass on the strength rule below. The "+25 for naming nowhere" bonus is removed.

Everyday keywords stop earning points on their own — they only count once a place has been established. That single change is what stops the retail-crime story hitting 100.

### 2. The "how local?" dial

One slider per feed, five steps from **Strictly my town** to **Wide area**. It sets, behind the scenes: how much a nearby place is discounted, whether nowhere-stories can ever pass, and the score an article needs to publish by itself. Each step shows a plain sentence of what it means, plus a live count of how many of your last 200 arrivals would have passed at that setting.

### 3. Neighbouring places

A short list you control. Each entry is a place name plus **Near** or **Further out**. Near loses a little score, further out loses more. Suggest-a-place fills the list from your region on first use, and you edit freely.

### 4. Big story override

A nearby or nowhere story can still publish automatically when it is strong on its own: a major-incident signal (death, fire, crash, arrest, closure, strike, flood, court, inquest), large numbers (money, people affected), or a named organisation from your list. Strength is computed from the article text, and passing it restores the score the distance discount removed. Home stories are unaffected.

### 5. Show the working

Every arrival gets a one-line reason in the pipeline: "Home — Towner Art Gallery", "Nearby (Hailsham) — big story override", "No place named — held". So you can see why anything scored what it did and tune the dial with evidence rather than guesswork.

## Technical notes

- Migration on `topics`: `locality_strength smallint default 3` (1-5 dial), `nearby_places jsonb default '[]'` (`[{name, tier:'near'|'far'}]`), `big_story_override boolean default true`. Backfill `nearby_places` from existing `competing_regions` where present.
- `_shared/region-config.ts` — `calculateRegionalRelevance` restructured into: resolve place tier (home / nearby / nowhere) → base score → keyword, landmark, postcode, organisation points applied only when tier is home or nearby → distance discount by tier and dial → big-story override → source multiplier → clamp. Remove the `+25` no-region branch and the `+15` national bonus for nowhere articles. Return a new `placeTier` and `reason` alongside the score.
- New `_shared/news-values.ts` — dial-to-parameters map (nearby discount, nowhere cap, auto-publish threshold), `detectPlaceTier` reusing the existing whole-word `matchPlaceName` matcher, `scoreStoryStrength`.
- `hybrid-content-scoring.ts` — `meetsTopicRelevance` uses the dial's threshold instead of the fixed 10/12/15; competing-region penalties read `nearby_places` rather than sibling topics.
- `auto-simplify-queue/index.ts` — locality gate replaced by the shared `detectPlaceTier` so gate and score can never disagree; auto-publish only when tier is home, or the override fires; anything else is held for manual review as now. The category `geographic_radius_miles` relaxation is retired.
- `topic_articles` — persist `place_tier text` and reuse `held_reason` for the readable explanation.
- UI: new `src/components/topics/NewsValuesPanel.tsx` (dial, nearby list, override toggle, live pass-count preview) placed alongside `KeywordManager`; `TopicCompetingRegions.tsx` retired into the nearby list.
- Verification: replay the last 200 Eastbourne arrivals through the new scorer at each dial step and compare against what was actually published, before switching the live path over.
