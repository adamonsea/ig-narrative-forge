---
name: LLM Provider Routing
description: All text generation routes through supabase/functions/_shared/llm-router.ts — DeepSeek primary on cost grounds, Lovable AI Gateway (Gemini) as fallback, order flippable via LLM_PRIMARY
type: architecture
---
DeepSeek stays the primary text provider on cost grounds: at Aug 2026 rates `deepseek-v4-flash` is ~$0.14/1M in and ~$0.28/1M out, roughly 5-9x cheaper than Gemini 2.5 Flash. DeepSeek's announced price rise has no published figure yet; it would need ~9x on output before Gemini Flash wins on cost.

- `supabase/functions/_shared/llm-router.ts` exposes `llmFetch({ body, headers }, { deepseekApiKey, context })`, a drop-in replacement for direct `fetch('https://api.deepseek.com/chat/completions', ...)` calls.
- Default order: DeepSeek (`DEEPSEEK_API_KEY`) → Lovable AI Gateway (`LOVABLE_API_KEY`) fallback on error/exception. Providers without a key are skipped.
- Set the `LLM_PRIMARY` secret to `gateway` to flip Gemini to primary without a code change — do this when DeepSeek's new pricing lands.
- Model map for the gateway path: `deepseek-v4-flash`/`deepseek-chat` → `google/gemini-2.5-flash`; `deepseek-v4-pro`/`deepseek-reasoner` → `google/gemini-2.5-pro`.
- Never add new direct `api.deepseek.com` fetches — go through the router.
- Key guards must accept either `LOVABLE_API_KEY` or `DEEPSEEK_API_KEY`.
