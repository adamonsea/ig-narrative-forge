# First story card in under 2 seconds (public feed, phone on 4G)

## What I measured (live Eastbourne, phone profile, 4x slower CPU, 4G)
This run showed the first card at 5.9s. Your 4.5s is the same pattern on a lighter profile. Timeline:

```text
0.0 to 1.3s   page HTML arrives (5 KB, no stories in it)
1.3 to 1.9s   ~95 code files download (about 450 KB, the biggest 161 KB)
1.9 to 2.8s   phone runs the code before asking for any data
2.8 to 3.0s   call 1: feed details (2 calls)
3.0 to 4.0s   call 2: stories (1.0s, 26 KB)
4.1 to 4.3s   call 3: popularity and parliament extras (the card waits for these)
4.3 to 5.9s   card built, fonts load (4.9s), then pictures are only requested (5.9s)
```

## Top 5 causes (seconds, this run)
1. **The page arrives empty.** Nothing starts until the code has run: about 1.5s of download and setup before any data call.
2. **Three data rounds, one after another:** about 1.5s, of which the stories call alone is 1.0s.
3. **First picture starts last.** It waits for the cards to be built (+1.6s after the data). It could start with the data.
4. **The card waits for extras.** Popularity and parliament data (0.2s) plus building the full carousel and its extras: about 1s of work on the phone.
5. **Too much code for a reader.** 95 files, including dialogs, dropdowns, quiz, events and editor parts not needed for the first card. About 0.5s on a mid-range phone. Fonts add 0.2 to 0.3s.

## Fixes, biggest win first (estimated saving on 4.5s)
1. **Send the first screen with the page** (1.5 to 2s). The server fetches the feed details and the first 3 stories in one go, puts them in the page and adds a preload for picture 1 at card size. The reader sees card 1 as soon as the HTML lands. It looks the same, with the same stories and order.
2. **One combined data call for the first screen** (0.8 to 1s). Feed details plus page 1 in a single database call. Make the 1.0s stories call faster first: check its query plan and add an index if it helps.
3. **Show stories without waiting for extras** (0.3 to 0.5s). Popularity, parliament, pins, what's on and reaction counts fill in after the first card, in the same places.
4. **Edge caching of the first-screen response** (0.3 to 0.6s on repeat visits). 60 seconds, public feeds only, with no reader-specific data in it.
5. **Lighter reader code** (0.3 to 0.5s). Load quiz, events, dialogs, menus, cookie banner and sharing after the first card. Check that no Desk or admin code reaches the reader page.
6. **Fonts** (0.2s). Preload the one Work Sans weight used on the card and drop font families the feed doesn't use.

Target: about 1.6 to 2.0s on your profile. Fix 1 is the key one; without it, under 2s is unlikely.

## Not changing
How anything looks or reads, card order and positions, reader counting (still after the human signal), billing, language work.

## How I'll prove it
- Before and after on the live Eastbourne feed, with Lisbon as a control, using the same phone and 4G script (`scripts/smoke/feed_perf.py` plus this timeline). Five runs each, median reported: first card, first picture, number of data rounds, code size, scroll fps.
- After you publish, the real-visitor first-paint figures (p75) for /@eastbourne, once there are 30 or more readings.
- The after-change check (15/15) runs after each fix, plus a side-by-side screenshot of the first card to show nothing looks different.

## Technical notes
- The /feed/$slug route renders on the client only. Fix 1 adds a route loader with SSR for the first page, reusing `get_topic_stories_with_keywords` (same ordering rule as AGENTS.md) and hydrating React Query so there's no refetch.
- `useHybridTopicFeedWithKeywords` awaits `get_popular_stories_by_period` and stories metadata before setting stories (line ~963). Fix 3 makes that fill in after.
- Picture preload goes in the route's head() using the same `render/image` size the card asks for.
