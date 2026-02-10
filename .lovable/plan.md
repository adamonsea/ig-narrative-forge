

## Fix: Replace TinyURL with is.gd

### Problem
TinyURL's free `api-create.php` endpoint now shows a consent/cookie interstitial page before redirecting. This is not a staging issue — it affects all links and completely breaks the share experience.

### Solution
Swap the shortener to **is.gd** — free, no API key, no interstitial, instant 301 redirects (crawlers follow them for OG tags), running since 2009.

### Change

**`src/lib/urlShortener.ts`** (single file, 3 line changes):
- Line 5: Update JSDoc comment from "TinyURL" to "is.gd"
- Line 18: Change endpoint from `https://tinyurl.com/api-create.php?url=` to `https://is.gd/create.php?format=simple&url=`
- Line 31: Change validation prefix from `https://tinyurl.com/` to `https://is.gd/`

No other files need to change — `StoryCarousel.tsx` and `DailyRoundupList.tsx` already call `shortenUrl()` and will automatically use the new service.

### Result
Share links become `https://is.gd/AbCdEf` which redirect instantly and transparently to the Supabase share-page function, preserving all OG previews with zero interstitials.

