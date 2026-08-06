// Central LLM router.
//
// DeepSeek remains the primary provider on cost grounds (v4-flash is roughly
// 5-9x cheaper per token than Gemini 2.5 Flash today). The Lovable AI Gateway
// (Gemini) is kept wired up as an automatic fallback for outages/errors.
//
// Order is configurable without a code change: set the `LLM_PRIMARY` secret to
// `gateway` to flip Gemini to primary (e.g. once DeepSeek publishes its price
// rise). Any other value, or unset, keeps DeepSeek primary.
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
 * Routes to DeepSeek first, falling back to the Lovable AI Gateway (Gemini).
 * Set `LLM_PRIMARY=gateway` to reverse the order.
 */
export async function llmFetch(
  init: { body: any; headers?: Record<string, string>; [key: string]: any },
  options: LlmFetchOptions = {}
): Promise<Response> {
  const context = options.context ?? 'llm';
  const body: Record<string, any> =
    typeof init.body === 'string' ? JSON.parse(init.body) : init.body;

  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const headerKey = (init.headers?.['Authorization'] ?? '').replace(/^Bearer\s+/i, '');
  const deepseekKey =
    options.deepseekApiKey || headerKey || Deno.env.get('DEEPSEEK_API_KEY') || '';

  const gatewayFirst = (Deno.env.get('LLM_PRIMARY') ?? '').toLowerCase() === 'gateway';

  const callDeepseek = () =>
    fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, model: body.model ?? 'deepseek-v4-flash' }),
    });

  const callGateway = () =>
    fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gatewayBody(body)),
    });

  const providers: Array<{ name: string; key: string; call: () => Promise<Response> }> = [
    { name: 'DeepSeek', key: deepseekKey, call: callDeepseek },
    { name: 'AI gateway', key: lovableKey ?? '', call: callGateway },
  ];
  if (gatewayFirst) providers.reverse();

  const available = providers.filter((p) => p.key);

  if (available.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No LLM provider configured (DEEPSEEK_API_KEY or LOVABLE_API_KEY)' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let lastError: unknown = null;

  for (let i = 0; i < available.length; i++) {
    const provider = available[i];
    const isLast = i === available.length - 1;

    try {
      const resp = await provider.call();
      if (resp.ok) return resp;

      const detail = await resp.clone().text().catch(() => '');
      console.warn(`⚠️ [${context}] ${provider.name} ${resp.status}: ${detail.slice(0, 300)}`);
      if (isLast) return resp;
      console.log(`↩️ [${context}] Falling back to ${available[i + 1].name}`);
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ [${context}] ${provider.name} request failed:`, err);
      if (isLast) throw err;
      console.log(`↩️ [${context}] Falling back to ${available[i + 1].name}`);
    }
  }

  throw lastError ?? new Error('LLM router exhausted all providers');
}
