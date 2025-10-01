# SEO Implementation Guide

## Overview
This document outlines the SEO improvements implemented for curatr topic feeds to improve Google ranking and discoverability.

## What Was Implemented

### 1. Dynamic Meta Tags (✅ Implemented)
- **Location**: `src/components/seo/TopicFeedSEO.tsx`
- **Features**:
  - Unique page titles per topic feed
  - Custom descriptions per topic
  - Open Graph tags for social sharing
  - Twitter Card tags
  - Canonical URLs
  - Geo tags for regional topics

### 2. Structured Data (✅ Implemented)
- **ItemList Schema**: Added to each topic feed page
  - Helps Google understand the feed structure
  - Improves rich snippet potential
  
- **Article Schema**: Ready to implement per story
  - Location: `src/components/seo/StoryStructuredData.tsx`
  - Can be added to individual story carousels if needed

### 3. Sitemap Generation (✅ Implemented)
- **Static Sitemap**: `public/sitemap.xml`
  - Basic fallback for search engines
  
- **Dynamic Sitemap**: Edge function at `/sitemap-xml`
  - Auto-generates from active public topics in database
  - Updates in real-time as new topics are added
  - Includes proper change frequency and priority tags

- **robots.txt**: Updated with sitemap references

## How It Works

### Dynamic Meta Tags
Every topic feed page now automatically generates:
```html
<title>Topic Name | curatr</title>
<meta name="description" content="Custom description..." />
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="..." />
<!-- + more -->
```

### Accessing the Sitemap
- **Static**: https://curatr.pro/sitemap.xml
- **Dynamic**: https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/sitemap-xml

The dynamic sitemap automatically includes all active public topic feeds.

## What Was NOT Implemented (Yet)

### Server-Side Rendering (SSR)
- **Why skipped**: Major architectural change (would require Next.js migration)
- **Alternative**: Relying on Google's JavaScript rendering (good enough for now)
- **Consider if**: You notice indexing problems in Search Console

## Testing Your SEO

### 1. Check Meta Tags
- Visit any topic feed
- Right-click → "View Page Source"
- Look for `<meta>` tags in the `<head>` section

### 2. Test Rich Snippets
- Use [Google's Rich Results Test](https://search.google.com/test/rich-results)
- Enter your feed URL
- Should show ItemList structured data

### 3. Verify Sitemap
- Visit: https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/sitemap-xml
- Should see XML with all public topic feeds
- Submit to Google Search Console

### 4. Social Preview
- Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- Use [Twitter Card Validator](https://cards-dev.twitter.com/validator)
- Should show custom title, description, and logo

## Next Steps

1. **Submit sitemap to Google Search Console**
   - Go to Search Console
   - Add both sitemap URLs
   - Monitor indexing status

2. **Monitor Performance**
   - Check Search Console for impressions/clicks
   - Track organic traffic in analytics
   - Watch for rich snippet appearances

3. **Optimize Individual Topics**
   - Ensure descriptions are keyword-rich
   - Use compelling titles (< 60 chars)
   - Add custom logos for better social sharing

## Impact on Performance

✅ **Zero impact on feed functionality**
- All SEO elements are additive only
- No changes to existing feed rendering
- Meta tags load asynchronously via react-helmet-async

## Troubleshooting

### Meta tags not showing?
- Check browser console for errors
- Verify HelmetProvider is wrapping App in main.tsx

### Sitemap empty?
- Check that topics have `is_public = true` and `is_active = true`
- Verify topics have slugs
- Test edge function directly

### Social previews not updating?
- Use Facebook/Twitter debugger to force refresh
- Check that logo_url exists in branding_config
- Verify image URLs are publicly accessible
