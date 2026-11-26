# Route rules
- Feed/story link previews come only from route `loader`+`head()` via `src/lib/shareMeta.ts`; crawlers read the server HTML, never client code.
- Public feed address is `/@{slug}`: `src/router.tsx` rewrites it to the unchanged `/feed/$slug/...` routes (`src/lib/feedHandle.ts`); renamed handles redirect via `topic_slug_history` (`resolve_feed_slug`, set only through guarded `set_feed_handle`); one route tree, old links work forever.
- The public feed's first page (stories, popularity, metadata) comes from the route loader via `src/lib/feedFirstScreen.ts` and seeds `useHybridTopicFeedWithKeywords` once (page 0, no filters), with a card-size cover preload in head(); the first card needs no client round trips.
