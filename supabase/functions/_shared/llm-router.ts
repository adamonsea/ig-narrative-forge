// Central LLM router.
//
// Why this exists: DeepSeek announced a significant price increase, so text
// generation now defaults to the Lovable AI Gateway (Gemini) and only falls
// back to DeepSeek when the gateway is unavailable or the key is missing.
//
// All call sites stay OpenAI-compatible — `llmFetch` accepts the same body a
// DeepSeek/OpenAI chat-completions call would use and returns a normal
// `Response`, so existing parsing code is unchanged.

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// DeepSeek model name -> gateway equivalent.
const MODEL_MAP: Record<string, string> = {
  'deepseek-chat': 'google/gemini-2.5-flash',
  'deepseek-v4-flash': 'google/gemini-2.5-flash',
  'deepseek-v4-pro': 'google/gemini-2.5-pro',
  'deepseek-reasoner': 'google/gemini-2.5-pro',
};

export function mapModel(model?: string): string {
  if (!model) return 'google/gemini-2.5-flash';
  if (model.includes('/')) return model; // already a gateway model id
  return MODEL_MAP[model] ?? 'google/gemini-2.5-flash';
}

function gatewayBody(body: Record<string, any>) {
  const { model, messages, temperature, max_tokens, response_format, stream } = body;
  const mapped: Record<string, any> = { model: mapModel(model), messages };
  if (typeof temperature === 'number') mapped.temperature = temperature;
  if (typeof max_tokens === 'number') mapped.max_tokens = max_tokens;
  if (response_format) mapped.response_format = response_format;
  if (stream) mapped.stream = stream;
  return mapped;
}

export interface LlmFetchOptions {
  /** DeepSeek key used only for the fallback path. */
  deepseekApiKey?: string;
  /** Label used in logs. */
  context?: string;
}

/**
 * Drop-in replacement for `fetch('https://api.deepseek.com/chat/completions', init)`.
 * Routes to the Lovable AI Gateway first, then DeepSeek.
 */
export async function llmFetch(
  init: { body: any; headers?: Record<string, string>; [key: string]: any },
  options: LlmFetchOptions = {}
): Promise<Response> {
  const context = options.context ?? 'llm';
  const body: Record<string, any> =
    typeof init.body === 'string' ? JSON.parse(init.body) : init.body;

  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const deepseekKey =
    options.deepseekApiKey ??
    (init.headers?.['Authorization'] ?? '').replace(/^Bearer\s+/i, '') ??
    Deno.env.get('DEEPSEEK_API_KEY');

  if (lovableKey) {
    try {
      const resp = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gatewayBody(body)),
      });

      if (resp.ok) return resp;

      const detail = await resp.clone().text().catch(() => '');
      console.warn(
        `⚠️ [${context}] AI gateway ${resp.status}: ${detail.slice(0, 300)}`
      );

      // Rate limit / payment issues are worth surfacing rather than silently
      // paying DeepSeek prices, unless we have no fallback at all.
      if (!deepseekKey) return resp;
    } catch (err) {
      console.warn(`⚠️ [${context}] AI gateway request failed:`, err);
      if (!deepseekKey) throw err;
    }
  }

  if (!deepseekKey) {
    return new Response(
      JSON.stringify({ error: 'No LLM provider configured (LOVABLE_API_KEY or DEEPSEEK_API_KEY)' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`↩️ [${context}] Falling back to DeepSeek (${body.model ?? 'deepseek-v4-flash'})`);
  return await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deepseekKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, model: body.model ?? 'deepseek-v4-flash' }),
  });
}
