

# Risk-Free Organic Traffic and SEO Improvements

## 1. Fix the "Loading..." Title in index.html

The most impactful zero-risk fix. Right now, if any crawler (Google, Perplexity, etc.) fails to execute JavaScript, they see `<title>Loading...</title>` and a bare description of "Curated news and updates". This is the first thing every bot reads.

**Change:** Update `index.html` to have a proper default title, description, Open Graph tags, and Twitter Card tags so even without JS, the page presents well.

---

## 2. Add a Public /discover Page

There is currently no crawlable directory of all public feeds. Google and AI search engines have no way to discover feeds except through the dynamic sitemap edge function. A `/discover` page listing all public topics with names, descriptions, and links gives:
- A crawlable hub page linking to every feed (internal link juice)
- A page users can browse and share
- A landing target for "curated news about X" searches

**Change:** Create a new `src/pages/Discover.tsx` page that fetches all public active topics and renders them as cards with links to `/feed/{slug}`. Add a route at `/discover` in `App.tsx`. Link to it from the homepage nav and footer.

---

## 3. Add RSS Autodiscovery to Feed Pages

The RSS edge function already exists at `/rss-feed/{slug}`, but feed pages don't advertise it via the standard `<link rel="alternate" type="application/rss+xml">` tag. This means RSS readers and AI aggregators can't auto-discover the feed.

**Change:** Add an RSS autodiscovery `<link>` tag inside `TopicFeedSEO.tsx` so any RSS reader or crawler visiting a feed page can find the RSS URL.

---

## 4. Add Homepage Link to /discover and Sitemap Entry

The static `sitemap.xml` only lists `/` and `/pricing`. Adding `/discover` plus the dynamic sitemap URL reference improves crawlability.

**Change:** Add `/discover` to `public/sitemap.xml`. Also add a link to Discover in the homepage navigation.

---

## 5. Improve robots.txt with Dynamic Sitemap Reference

Currently `robots.txt` only points to the static sitemap. Adding the dynamic edge function sitemap URL ensures Google crawls all published content.

**Change:** Add a second `Sitemap:` line pointing to the dynamic sitemap edge function.

---

## Technical Details

### index.html (lines 8-9)
Replace the placeholder title and description with:
```html
<title>Curatr - AI-Curated News Feeds</title>
<meta name="description" content="Create and follow curated news feeds powered by AI. Local news, niche topics, and more from trusted sources." />
<meta property="og:title" content="Curatr - AI-Curated News Feeds" />
<meta property="og:description" content="Create and follow curated news feeds powered by AI." />
<meta property="og:image" content="https://curatr.pro/curatr-icon.png" />
<meta property="og:url" content="https://curatr.pro" />
<meta name="twitter:card" content="summary" />
```

### New file: src/pages/Discover.tsx
- Fetch all topics where `is_active = true` and `is_public = true`
- Render as a grid of cards (name, description, story count)
- Each card links to `/feed/{slug}`
- Include SEO helmet with title "Discover Feeds | Curatr"

### src/App.tsx
- Import Discover page
- Add `<Route path="/discover" element={<Discover />} />`

### src/components/seo/TopicFeedSEO.tsx
- Add inside the `<Helmet>` block:
```html
<link rel="alternate" type="application/rss+xml"
  title="{topicName} RSS Feed"
  href="https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/rss-feed/{topicSlug}" />
```

### public/robots.txt
- Add second sitemap line:
```
Sitemap: https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/sitemap-xml
```

### public/sitemap.xml
- Add `/discover` entry with priority 0.8

### Homepage nav (Index.tsx)
- Add "Discover" link next to "Pricing" in the header

All changes are additive -- no existing functionality is modified or removed.

