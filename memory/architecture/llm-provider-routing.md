---
name: LLM Provider Routing
description: All text generation routes through supabase/functions/_shared/llm-router.ts — Lovable AI Gateway (Gemini) first, DeepSeek only as fallback
type: architecture
---
DeepSeek announced a significant price rise (Aug 2026), so it is no longer the default text provider.

- `supabase/functions/_shared/llm-router.ts` exposes `llmFetch({ body, headers }, { deepseekApiKey, context })`, a drop-in replacement for the old `fetch('https://api.deepseek.com/chat/completions', ...)` calls.
- Model map: `deepseek-v4-flash`/`deepseek-chat` → `google/gemini-2.5-flash`; `deepseek-v4-pro`/`deepseek-reasoner` → `google/gemini-2.5-pro`.
- Order: Lovable AI Gateway (`LOVABLE_API_KEY`) → DeepSeek fallback if gateway errors and a DeepSeek key exists.
- Never add new direct `api.deepseek.com` fetches — go through the router.
- Key guards must accept either `LOVABLE_API_KEY` or `DEEPSEEK_API_KEY`.
