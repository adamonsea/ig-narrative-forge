# Internal Appendix — Proprietary Logic (DO NOT DISTRIBUTE)

> **Confidential.** This document captures the defensible, non-obvious logic behind
> ingestion, gatekeeping, scoring, and prompt configuration. It is **not** part of the
> public API reference and must never be published, embedded in client bundles, or shared
> outside the core team. Treat thresholds and prompt text as trade secrets.

---

## 1. Locality gatekeeper (regional topics)

Purpose: prevent geographically irrelevant stories from auto-publishing/auto-queueing for
local feeds, even when broad keywords match.

- **Where**: `auto-simplify-queue/index.ts` (auto-publish / auto-simplify path).
- **Rule**: for `topic_type = 'regional'`, an article must contain at least one **local anchor**
  in the **title or first 500 characters** of the body to be eligible for automation.
- **Local anchor types** (in priority order): topic `region`, `landmarks`, `postcodes`,
  `organizations`. Broad/area-wide terms (e.g. very large geographies) do **not** count as
  anchors on their own.
- **Failure behaviour**: articles failing the gate are **held in the `new` Arrivals queue**
  for manual review — they are not discarded and not auto-queued.
- **Holiday mode interaction**: holiday-mode auto-publish still requires the locality gate to
  pass; quality/keyword score alone is insufficient (this was the River Meon regression fix).

---

## 2. Relevance & quality scoring

### 2.1 Quality score (`calculateQualityScore`)
Word-count tiers (additive):

| Words | Points |
| --- | --- |
| ≥500 | 50 |
| 300–499 | 40 |
| 200–299 | 35 |
| 150–199 | 30 |
| 100–149 | 25 |
| 50–99 | 15 |
| 25–49 | 10 |

Bonuses: author present `+15`, `published_at` present `+15`, title ≥20 chars `+15`
(≥10 chars `+10`), image present `+5`. Snippet penalty `-30`. Capped at 100.

### 2.2 Relevance score (keyword path)
`min(100, 20 + matches × 15)` where `matches` = distinct topic keywords found in
`title + body` (lowercased). No keywords ⇒ default `50`.

### 2.3 Regional relevance
Computed via `_shared/hybrid-content-scoring.ts` (`calculateTopicRelevance`) using region,
landmarks, postcodes, organizations, and competing regions. Competing regions are handled by
**weighted negative scoring**, not binary rejection — the final relevance score decides
pass/fail against the threshold from `getRelevanceThreshold(topic_type, source_type)`.

### 2.4 Promotion / processing thresholds
- Multi-tenant ingest marks `processing_status = 'processed'` when
  `quality ≥ 60 AND relevance ≥ 5 AND wordCount ≥ 150`, otherwise `'new'`.
- Test/legacy path uses `quality ≥ 60 && relevance ≥ 5 && wordCount ≥ 150`.

---

## 3. Snippet / truncation detection (`isContentSnippet`)

- `<25` words ⇒ always a snippet.
- `≥200` words ⇒ never a snippet (regardless of indicator words).
- Truncation indicators (strong signal): `read more`, `continue reading`, `full story`,
  `view more`, `the post`, `appeared first`, `original article`, `click here`, `see more`,
  `read the full`. Deliberately **excludes** `subscribe`/`newsletter` (appear in full articles).
- Clear truncation: ends with `...`/`…`, or has `<2` sentences.
- Medium content (25–199 words): flagged only if `(truncationIndicator && words < 100)` or
  `(clearlyTruncated && words < 75)`.

---

## 4. Duplicate & negative-keyword filtering

- **Duplicate detection**: 70% title-similarity threshold, scoped **per topic**
  (`src/lib/titleSimilarity.ts`, `auto-cleanup-duplicates`).
- **Negative keywords**: multi-layer rejection — any topic `negative_keywords` term present in
  `title + body` discards the article before relevance scoring.
- **Suppression**: discarded articles are prevented from reactivation via DB trigger.
- **Age gate**: articles older than `maxAgeDays` (default 7) are skipped at ingest.

---

## 5. Scraping intelligence

- **Domain profiles**: `resolveDomainProfile` (`_shared/domain-profiles.ts`) supplies adaptive,
  per-domain scraping strategy memory (`scraper_domain_profiles`).
- **Strategy execution**: `EnhancedScrapingStrategies.executeScrapingStrategy()` runs the
  unified parallel strategy; on failure the chain falls back to `beautiful-soup-scraper`.
- **Source health**: success/failure counts, cooldown, and last-scraped metrics drive
  source-health scoring and scheduling priority.
- **Storage**: multi-tenant storage only (no legacy dual-write) via
  `MultiTenantDatabaseOperations.storeArticles`, deduplicating on `normalized_url`.

---

## 6. Content generation & prompts

> Full prompt text lives in code/edge functions and prompt config — never copy it into shared docs.

- **LLM failover**: DeepSeek → OpenAI on `402/429/503`; strip markdown code fences before
  JSON parse (`_shared` LLM helpers).
- **Tone fallback chain**: article tone > topic tone > system default.
- **Image generation**: OpenAI GPT Image 1.5 primary; Replicate FLUX fallback;
  Wan 2.2 i2v for image-to-video. Background/auto jobs force `gpt-image-1.5-low`.
- **Landmark intelligence**: GPT-4o-mini extracts location detail to enrich image prompts.
- **Illustration guardrails**: flat poster style; absolute ban on shading/realism.
- **Credit tiers**: image generation 2 / 4 / 8 credits by quality; story reel render = 4 credits
  (`src/lib/creditService.ts`, `CREDIT_COSTS.STORY_REEL`). Marginal infra cost of reel render is
  ~$0 (client-side encoding); real spend is upstream AI image generation.

---

## 7. Internal job name map

These names are genericised in the public reference. Keep this mapping internal.

| Public category | Internal functions |
| --- | --- |
| Content ingestion | `universal-scraper`, `unified-scraper`, `multi-tenant-scraper`, `topic-aware-scraper`, `content-extractor`, `manual-topic-scrape`, `beautiful-soup-scraper` |
| Automation & scheduling | `automated-scheduler`, `auto-simplify-queue`, `publish-ready-stories`, `topic-automation-monitor`, `drip-feed-scheduler` |
| Maintenance & backfill | `auto-cleanup-duplicates`, `bulk-cleanup-articles`, `source-health-monitor`, `backfill-*` |
| Notifications | `send-story-notification`, `send-email-newsletter` |

---

## 8. Handling rules

- Never expose thresholds, scoring formulas, anchor logic, or prompt text in any public doc,
  client bundle, API response, or error message.
- The public API reference (`API_REFERENCE_PUBLIC.md`) is the only externally shareable
  endpoint document. `API_REFERENCE.md` retains internal names and stays internal.
- When adding new proprietary logic, document it here and confirm the public reference still
  genericises it.