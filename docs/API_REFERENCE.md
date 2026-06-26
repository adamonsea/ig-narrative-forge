# Developer API Reference — Curatr (eeZee News)

The public API surface is a set of Supabase Edge Functions. This reference covers the endpoints implemented and in use, with auth requirements and request/response examples.

## Conventions

- **Base URL**: `https://<project-ref>.supabase.co/functions/v1`
- **Content type**: `application/json` (unless noted).
- **API key**: all requests include the Supabase `apikey` header (anon/publishable key). The frontend uses the generated Supabase client, which adds it automatically.
- **Auth header**: authenticated endpoints require `Authorization: Bearer <user_access_token>`.
- **CORS**: all functions allow cross-origin requests and handle `OPTIONS` preflight.
- **Errors**: failures return `{ "error": "..." }` (or `{ "success": false, "error": "..." }`) with an appropriate status. Internal failures return a generic message; details are logged server-side.

### Auth levels

| Level | Meaning |
| --- | --- |
| **Public** | No user token required. Input is validated; trust signals derived server-side. |
| **Authenticated** | Valid user JWT required (`401` if missing). |
| **Owner/Admin** | Valid JWT **and** topic ownership or admin role (`403` if not). |
| **Internal** | Service-role key only; not callable from the browser. |

---

## Public endpoints

### POST `/secure-newsletter-signup`
Subscribe a reader to a topic newsletter. Client IP is extracted server-side from trusted headers; never sent in the body.

Auth: **Public**

Request
```json
{
  "email": "reader@example.com",
  "name": "Jane",
  "topicId": "0f3c…",
  "notificationType": "daily"
}
```

Response `200`
```json
{ "success": true, "message": "Subscribed" }
```
Errors: `400` (missing `email`/`topicId`, invalid email), `405` (non-POST).

---

### POST `/submit-quiz-response`
Record an anonymous quiz answer and return the aggregate distribution. Idempotent per `visitorId` + `questionId`.

Auth: **Public**

Request
```json
{
  "questionId": "8a1e…",
  "selectedOption": "B",
  "visitorId": "v_abc123",
  "userId": null,
  "responseTimeMs": 4200
}
```

Response `200`
```json
{
  "success": true,
  "alreadyAnswered": false,
  "isCorrect": true,
  "correctOption": "B",
  "percentages": { "A": 12, "B": 63, "C": 15, "D": 10 }
}
```
Errors: `400` (missing required fields), `404` (question not found).

---

### GET `/widget-feed-data?feed=<slug>&max=<1-10>`
Returns the latest published stories for a public feed, for embeddable widgets. Cached at the edge (`max-age=300, stale-while-revalidate`). Public topics only.

Auth: **Public**

Response `200`
```json
{
  "feed": { "name": "Eastbourne News", "slug": "eastbourne" },
  "stories": [
    { "id": "…", "title": "…", "url": "https://curatr.pro/…", "published_at": "2026-06-20T…" }
  ]
}
```
Errors: `400` (missing `feed`). `max` is clamped to 1–10.

---

### POST `/shorten-url`
Creates a short link. Only URLs on trusted origins are accepted (`curatr.pro`, `*.curatr.pro`, `breefly.lovable.app`, `*.supabase.co`, HTTPS only).

Auth: **Public**

Request
```json
{ "url": "https://curatr.pro/feed/eastbourne/story/123" }
```

Response `200`
```json
{ "code": "Ab3xZ9", "shortUrl": "https://curatr.pro/r/Ab3xZ9" }
```
Errors: `400` (missing url, or URL not on the allowlist).

---

### GET `/topic-manifest?slug=<slug>` · GET `/generate-og-image?...` · GET `/sitemap-xml` · GET `/rss-feed?...`
Public delivery endpoints for SEO/social: topic manifest JSON, dynamically rendered Open Graph images (user params XML-escaped, `logo_url` restricted to HTTPS), sitemaps, and RSS. No auth.

---

## Authenticated (Owner/Admin) endpoints

These require `Authorization: Bearer <token>` and verify topic ownership or admin role.

### POST `/delete-story-cascade`
Deletes a story and all dependent rows. Caller must own the story's topic.

Auth: **Owner/Admin**

Request
```json
{ "story_id": "c91f…" }
```

Response `200`
```json
{ "success": true }
```
Errors: `400` (missing `story_id`), `401` (no/invalid token), `403` (not owner/admin), `500` (generic internal error).

---

### POST `/promote-topic-article` · POST `/mark-article-discarded`
Move an article through the editorial pipeline (promote to story / discard). Owner/Admin of the article's topic.

Request
```json
{ "article_id": "…", "topic_id": "…" }
```
Response `200`: `{ "success": true }`
Errors: `401`, `403`, `400`.

---

### POST `/update-topic-keywords`
Replace or merge a topic's keyword set. Owner/Admin.

Request
```json
{ "topic_id": "…", "keywords": ["eastbourne", "south downs", "seafront"] }
```
Response `200`: `{ "success": true, "keywords": [ … ] }`

---

### POST `/widget-avatar-upload`
Uploads a widget avatar to storage scoped to the caller's topic. Owner/Admin; validates file type/size.

Response `200`: `{ "success": true, "url": "https://…/widget-avatar.png" }`

---

### GET `/analytics-dashboard`
Aggregated performance/source/quality analytics. **Admin only.**

Auth: **Authenticated + Admin**

Response `200` (shape)
```json
{
  "performance_metrics": { "total_articles": 0, "total_stories": 0, "average_quality_score": 0, "processing_success_rate": 0, "regional_relevance_avg": 0 },
  "source_performance": [],
  "quality_trends": [],
  "content_analysis": { "top_keywords": [], "regional_distribution": [], "status_breakdown": [] },
  "recommendations": []
}
```
Errors: `401` (no token), `403` (not admin).

---

## Internal endpoints (service-role only)

Not callable from the browser. Invoked by cron schedulers or other edge functions presenting the service-role key (`isServiceRole(req)`), returning `401` otherwise. Categories:

- **Scraping/ingestion**: `universal-scraper`, `unified-scraper`, `multi-tenant-scraper`, `content-extractor`, `manual-topic-scrape`.
- **Automation/scheduling**: `automated-scheduler`, `auto-simplify-queue`, `publish-ready-stories`, `topic-automation-monitor`, `drip-feed-scheduler`.
- **Maintenance/backfill**: `auto-cleanup-duplicates`, `bulk-cleanup-articles`, `source-health-monitor`, and the various `backfill-*` functions.
- **Notifications**: `send-story-notification`, `send-email-newsletter` (verify JWT + ownership where user-triggered).

---

## Calling from the frontend

```ts
import { supabase } from "@/integrations/supabase/client";

// Public function
const { data } = await supabase.functions.invoke("submit-quiz-response", {
  body: { questionId, selectedOption, visitorId },
});

// Authenticated function — the client attaches the user's JWT automatically
const { data } = await supabase.functions.invoke("delete-story-cascade", {
  body: { story_id },
});
```

Direct table reads/writes also go through the Supabase client and are governed by RLS (see `SECURITY_MODEL.md`).