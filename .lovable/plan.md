

## Current Onboarding Flow — Problems Identified

The current topic creation is a **3-step form → redirect to dashboard → manually open source discovery modal → manually trigger scraping** flow. Key friction points:

1. **Step 2 is bloated** — type selector, region, audience level, description, AND keyword generation all crammed into one step. High cognitive load.
2. **Step 3 (keyword pruning) is a chore** — users must understand keyword categories, manually select/deselect from 50 keywords. Most users should never see this.
3. **After creation, the user lands on an admin dashboard** — jarring transition from a clean wizard to a complex settings page. No sense of progress toward a "live feed."
4. **Source discovery is a separate modal** — user has to find and click "Discover Sources" after landing on the dashboard. Breaks flow momentum.
5. **No visualization of the feed being built** — the DemoFlow has a beautiful build progress animation (DemoBuildProgress), but the real creation flow has nothing similar. User creates topic → lands on empty dashboard. Anticlimactic.
6. **No auto-scrape trigger** — after adding sources, user must manually start scraping. First-time users don't know to do this.

## Proposed Design: Streamlined "Feed Builder" Wizard

Collapse the entire journey — from naming to live feed — into a **single full-screen wizard** that never leaves the creation context. The user sees their feed "come alive" without touching the admin dashboard.

```text
Current:  Name → Details+Keywords → Dashboard → Find Sources → Manual Scrape → ???
Proposed: Name → Sources (auto) → Building... → Your Feed is Live!
```

### New Step Flow (4 steps, but faster)

**Step 1: Name your feed** (unchanged, clean)
- Same name input with validation
- Auto-detect regional vs keyword type from name (already works)
- On "Continue": auto-generate keywords + description in background (don't show to user)

**Step 2: Add sources** (merged into wizard)
- Auto-triggers source discovery immediately using the generated keywords
- Shows source pills appearing one by one (like current SourceDiscoveryModal but inline)
- User taps to add, dismiss, or just hits "Continue" to accept all
- Smart default: auto-add top 3 highest-confidence sources
- "Add all" button prominent

**Step 3: Building your feed** (new — inspired by DemoBuildProgress)
- Full-screen animated build visualization
- Three phases with checkmarks: "Sources connected" → "Gathering stories" → "Generating your feed"
- Actually triggers: topic creation → source linking → first scrape → auto-simplify
- Progress bar + encouraging messages
- A preview of the feed "assembling" — story cards slide in as they're found/generated
- This replaces the dead landing on an empty dashboard

**Step 4: Your feed is live** (new)
- Shows the actual first stories (if available) or a "stories incoming" state
- Big "View your feed" CTA that opens the public feed
- Secondary "Go to dashboard" link for power users
- Confetti or subtle celebration animation

### Technical Implementation

1. **Refactor `CreateTopicDialog.tsx`** — Remove step 2 (details) and step 3 (keywords). Auto-generate keywords silently after step 1. Add inline source discovery (step 2), build progress (step 3), and completion (step 4).

2. **Create `FeedBuildProgress.tsx`** — New component adapted from `DemoBuildProgress` pattern but wired to real Supabase operations (insert topic, link sources, invoke `universal-topic-scraper`, poll for stories).

3. **Auto-source selection** — After keyword generation, auto-add top 3 sources (confidence ≥ 75, reliability = high) without user action. User can still add/remove on step 2.

4. **Auto-scrape trigger** — Step 3 automatically invokes `universal-topic-scraper` for the new topic after sources are linked, then polls `topic_articles` count to show real progress.

5. **Update `TopicManager.handleTopicCreated`** — Remove the immediate redirect to dashboard. The wizard handles the entire flow and only navigates when the user explicitly clicks "View feed" or "Dashboard."

### What Gets Removed/Simplified

- **Step 2 details form** (type/region/audience/description) — auto-inferred or defaulted, editable later in settings
- **Step 3 keyword pruning** — keywords auto-selected, editable later in settings  
- **Post-creation redirect to empty dashboard** — replaced by in-wizard build visualization
- **Separate source discovery modal trigger** — merged into wizard step 2

### Scope

- Modify: `CreateTopicDialog.tsx` (major refactor)
- Create: `FeedBuildProgress.tsx` (real build progress with Supabase calls)
- Modify: `TopicManager.tsx` (remove immediate redirect)
- The admin dashboard, source manager, keyword settings remain untouched — they become "advanced settings" accessible later

