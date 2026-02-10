

## Clean up share links with on-the-fly URL shortening

### Problem
Share links expose the raw Supabase edge function URL (`fpoywkjgdapgjtdeooak.supabase.co/functions/v1/share-page/...`), which looks unprofessional. Previous attempts to use `curatr.pro` links directly broke OG image previews because the SPA can't serve server-rendered meta tags to crawlers.

### Solution
Use TinyURL's free API (no authentication required) to shorten share links on-the-fly. The flow stays exactly the same -- the short URL just redirects to the existing Supabase function, preserving all OG tag handling and image previews.

```text
Current flow:
  User taps Share --> ugly Supabase URL shared
  Crawler hits ugly URL --> gets OG tags --> shows preview (works)

New flow:
  User taps Share --> call TinyURL API --> get short URL --> share clean link
  Crawler hits short URL --> redirects to Supabase function --> gets OG tags --> shows preview (still works)
  Real user hits short URL --> redirects to Supabase function --> redirects to curatr.pro (still works)
```

### Why this is safe
- Zero changes to the share-page edge function
- Zero changes to OG tag rendering
- Zero changes to the redirect logic
- If the shortener API fails, graceful fallback to the existing Supabase URL
- TinyURL API is free, no API key needed, been stable for 20+ years

### Technical details

**1. New utility: `src/lib/urlShortener.ts`**
- `shortenUrl(longUrl: string): Promise<string>` -- calls `https://tinyurl.com/api-create.php?url=ENCODED_URL`
- Returns the short URL on success, or the original URL on failure (graceful fallback)
- Includes a simple in-memory cache so repeat shares of the same story don't re-call the API
- 3-second timeout to avoid blocking the share action

**2. Update `src/components/StoryCarousel.tsx`**
- In `handleShare` and `handleWhatsAppShare`: call `shortenUrl()` before sharing
- Show a brief "Preparing link..." state if needed (though it should be near-instant)
- If shortening fails, fall back to the current Supabase URL silently

**3. Update any other share handlers** (e.g., `DailyRoundupList.tsx`)
- Same pattern: shorten before sharing, fallback on failure

### What changes for the user
- Share links go from `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/share-page/my-story` to something like `https://tinyurl.com/3abc7de`
- OG previews (images, titles, descriptions) continue to work exactly as before
- If TinyURL is ever down, the old URL is used as fallback -- no broken shares

### Files to create/modify
- **Create** `src/lib/urlShortener.ts` -- shortener utility with caching and fallback
- **Edit** `src/components/StoryCarousel.tsx` -- use shortener in share handlers
- **Edit** `src/pages/DailyRoundupList.tsx` -- use shortener in daily roundup share

