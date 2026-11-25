# Curatr Feed API v1 (events, read-only)

One-way, read-only access to the events readers see in your feed. Free while in testing.

## Auth
Create a token in **Settings → Share → API token** (shown once; Curatr stores only a hash). Send it on every request:

    Authorization: Bearer cfa_…

A token works only for its own feed. Reset makes a new one and stops the old one; Revoke stops it.

## Endpoint
    GET https://curatr.pro/api/public/feed-api/v1/events?feed={handle}

| Param | Default | Notes |
|---|---|---|
| `feed` | required | Feed handle (`curatr.pro/@{handle}`). Old handles still work. |
| `limit` | 20 | 1–100 |
| `cursor` | – | `next_cursor` from the previous page (or use `offset`) |
| `offset` | 0 | Alternative to `cursor` |
| `from`, `to` | – | `YYYY-MM-DD`, filters on start date |
| `category` | – | e.g. `music`, `arts-theatre` |

Returns published, upcoming events: the same set, order and de-duplication as the public feed. Times are Europe/London (UK) or the feed's local listing time. `run_start`/`run_end` are set for multi-day runs. `image` appears only when **Include photos** is on and the owner hasn't hidden that photo; credit the source when you show it.

Limits: 60 requests per minute per token. Responses may be cached for 60 seconds. CORS is open.

## Errors
`{"error":{"code":"…","message":"…"}}`

| Status | Code |
|---|---|
| 400 | `bad_request` |
| 401 | `invalid_token` |
| 403 | `wrong_feed`, `not_available` |
| 404 | `feed_not_found` |
| 429 | `rate_limited` |

## Example
    curl -H "Authorization: Bearer cfa_…" \
      "https://curatr.pro/api/public/feed-api/v1/events?feed=whats-on-lisbon&limit=1"

```json
{
  "api_version": "1",
  "feed": { "name": "Whats on Lisbon", "handle": "whats-on-lisbon", "url": "https://curatr.pro/@whats-on-lisbon" },
  "events": [{
    "id": "47695d1f-0a6a-43de-9ead-ed3f04de7759",
    "title": "Sob Pressão",
    "description": "Na base do novo espetáculo de Cristina Carvalhal…",
    "start_date": "2026-11-25", "start_time": "19:00",
    "run_start": "2026-11-19", "run_end": "2027-01-10",
    "venue": "Teatro da Trindade INATEL",
    "category": "arts-theatre", "price": "€11–15", "is_free": false,
    "curatr_url": "https://curatr.pro/@whats-on-lisbon",
    "source": { "name": "agendalx.pt", "url": "https://www.agendalx.pt/events/event/sob-pressao/" },
    "image": {
      "url": "https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/topic-assets/…/events/47695d1f-….webp",
      "credit": "agendalx.pt",
      "source_url": "https://www.agendalx.pt/content/uploads/2026/06/SobPressao….jpg"
    }
  }],
  "total": 487,
  "next_cursor": "bzoy"
}
```

Stories and pins will be added later as `/v1/stories` and `/v1/pins` with the same `feed` / list / `next_cursor` envelope.
