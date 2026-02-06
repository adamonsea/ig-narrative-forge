
# Interactive Demo Flow for Curatr Homepage

## Overview
A guided, multi-step interactive demo embedded directly into the homepage that lets visitors experience the full Curatr pipeline -- from picking a topic, selecting a source, choosing voice/style, to seeing a live feed with their freshly generated stories. No sign-up required. The demo uses real data from pre-tested sources, making it feel authentic rather than canned.

## Demo Flow (5 Steps)

```text
[1. Pick a Topic] --> [2. Pick a Source] --> [3. Set Voice + Style] --> [4. Watch it Build] --> [5. See Your Feed]
```

### Step 1: "What do you want to curate?"
- 3-4 hardcoded demo topic cards (e.g. "Local News", "Tech & AI", "Sport", "Culture")
- Each card has a name, icon, and one-line description
- Behind the scenes, each maps to the Eastbourne topic (the only one with rich legacy content), but the UI presents them as distinct choices to show versatility
- Selecting a card animates it forward and fades the others

### Step 2: "Pick a source"
- Shows 3 pre-vetted, 100% success-rate sources for the chosen topic (e.g. sussexexpress.co.uk, bournefreelive.co.uk, bbc.co.uk)
- Each displayed as a clean pill/card with source name and article count
- User picks one source -- this is the source that will be "gathered" from
- Single source keeps the demo fast and focused

### Step 3: "Set your style"
- Two simple toggle choices, side by side:
  - **Tone**: Conversational / Engaging / Satirical (3 pills, pick one)
  - **Image style**: Illustrative / Photographic (2 pills, pick one)
- Minimal UI -- no dropdowns, just tappable pills
- Default pre-selected (Conversational + Illustrative)

### Step 4: "Building your feed..."
- Animated progress sequence (3 sub-steps, ~8-12 seconds total):
  1. "Gathering stories from [source]..." -- with a subtle progress bar
  2. "AI is rewriting in your voice..." -- shows tone badge
  3. "Generating cover images..." -- shows style badge
- Behind the scenes: calls the `enhanced-content-generator` edge function for 3 pre-selected recent articles from the chosen source (already in the articles table, status=pending or ready)
- If generation takes too long, falls back to showing existing published stories with a "Here's what your feed looks like" message
- This step creates the "investment effect" -- the user has committed choices and watched work happen, making the result feel earned

### Step 5: "Your feed is live"
- Renders a stripped-down version of the TopicFeed component in an embedded container
- Shows: the 3 newly generated stories at the top (if ready), plus 5-7 legacy published stories below
- Available interactions:
  - Swipe through story carousels (existing StoryCarousel component)
  - "Try Play Mode" button that opens SwipeMode in a modal/overlay
  - "Subscribe" button (existing SubscribeMenu) 
  - No hamburger menu, no filters, no curation tools -- clean reader experience only
- A floating CTA bar at the bottom: "Like what you see? Start curating your own feed" with sign-up button

## Behavioral Psychology Elements

1. **Endowment Effect**: User makes choices (topic, source, style) creating ownership over "their" feed before seeing it
2. **Investment Escalation**: Each step is a small commitment that makes abandoning feel like waste
3. **Progress Momentum**: The build animation creates anticipation and perceived value
4. **Social Proof**: Show "142 subscribers" or "8 stories published today" in the feed header
5. **Loss Aversion**: After seeing the feed, the CTA implies "this feed exists now -- sign up to keep it"
6. **Instant Gratification**: Real content, real AI output -- not mockups

## Additional Elevating Ideas

- **Typing animation** on the "rewriting" step showing a snippet of the AI-transformed headline
- **Before/after flash**: briefly show the raw article title, then animate to the rewritten version
- **Confetti or subtle sparkle** when the feed appears
- **"Your feed score: 94/100"** -- a fake-but-fun quality score to gamify the result
- **Play Mode teaser**: Auto-open a single swipe card as a teaser after 3 seconds on the feed view

## Technical Approach

### New Files
- `src/components/demo/DemoFlow.tsx` -- Main orchestrator with step state machine
- `src/components/demo/DemoTopicPicker.tsx` -- Step 1 topic cards
- `src/components/demo/DemoSourcePicker.tsx` -- Step 2 source selection
- `src/components/demo/DemoStylePicker.tsx` -- Step 3 tone + image style
- `src/components/demo/DemoBuildProgress.tsx` -- Step 4 animated progress
- `src/components/demo/DemoFeedPreview.tsx` -- Step 5 embedded feed
- `src/lib/demoConfig.ts` -- Hardcoded demo topic/source mappings and config

### Modified Files
- `src/pages/Index.tsx` -- Replace the static "How it works" section with the interactive demo, or add it as a new section between "How it works" and the CTA

### Edge Function Usage
- No new edge functions needed -- the demo will call `enhanced-content-generator` for the simplify step (existing function)
- Fallback: if the user is not authenticated, the demo skips actual generation and shows existing published stories directly (zero-auth demo path)

### Data Strategy
- Demo uses the Eastbourne topic's real sources and published stories
- Pre-select 3 recent articles per source that are known-good (have extractable content)
- The "gathering" step is cosmetic for the demo -- articles already exist in the DB
- The "simplify" step can be real (calling enhanced-content-generator) for authenticated users, or simulated for anonymous visitors
- Legacy stories provide the "full feed" feeling regardless of generation success

### Routing
- No new route needed -- the demo lives inline on the homepage (`/`)
- The embedded feed preview is not a full TopicFeed page, just a visual container using StoryCarousel components

### Mobile Considerations
- Steps stack vertically on mobile
- Topic/source cards become full-width tappable rows
- Style pills remain horizontal but wrap
- Feed preview is full-width with horizontal story swiping
