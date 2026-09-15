/**
 * Last-resort article extraction: when feeds, sitemaps, JSON-LD and HTML
 * parsing have all failed, read the page with an LLM and pull the article out.
 *
 * Strictly capped by the caller (pages per run) and by a project-wide daily
 * budget. Never throws — returns null when it cannot extract.
 */

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';
const FETCH_TIMEOUT_MS = 10000;

export interface AiExtractedArticle {
  title: string;
  body: string;
  author?: string | null;
  published_at?: string | null;
  image_url?: string | null;
  source_url: string;
}

/** Strip a page down to readable text for the model. */
function toPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function firstImage(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (og) return og;
  const img = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i)?.[1];
  return img || null;
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

export async function extractArticleWithAi(url: string): Promise<AiExtractedArticle | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.warn('AI extraction skipped: LOVABLE_API_KEY not configured');
    return null;
  }

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; eeZeeBot/1.0; +https://curatr.pro)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const text = toPlainText(html).slice(0, 12000);
  if (text.length < 300) return null;

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract a single news article from messy page text. Return ONLY JSON with keys ' +
              'title, body, author, published_at (ISO 8601 or null), and nothing else. ' +
              'body must be the article text only — no navigation, cookie notices, adverts or related-story lists. ' +
              'Copy the text as published; never summarise, rewrite or invent. ' +
              'If the page is not a news article, return {"title": null, "body": null}.',
          },
          { role: 'user', content: `URL: ${url}\n\nPAGE TEXT:\n${text}` },
        ],
      }),
    });
  } catch (error) {
    console.warn(`AI extraction request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(`AI extraction gateway error [${response.status}] for ${url}: ${body.slice(0, 300)}`);
    return null;
  }

  try {
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(stripFences(String(raw)));
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    if (title.length < 10 || body.length < 200) return null;

    return {
      title,
      body,
      author: typeof parsed.author === 'string' ? parsed.author.slice(0, 200) : null,
      published_at: typeof parsed.published_at === 'string' ? parsed.published_at : null,
      image_url: firstImage(html),
      source_url: url,
    };
  } catch (error) {
    console.warn(`AI extraction parse failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
