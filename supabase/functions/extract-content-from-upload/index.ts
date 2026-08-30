import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llmFetch } from '../_shared/llm-router.ts';
import { getUser, userOwnsTopic, unauthorized, forbidden } from '../_shared/auth.ts';
import { fetchWithRetry, extractContentFromHTML } from '../_shared/content-processor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface StoryDraft {
  headline: string;
  author: string;
  publication: string;
  publishedAt: string;
  body: string;
  sourceUrl?: string;
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const fail = (error: string, status = 200) => json({ success: false, error }, status);

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function domainFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function titleCaseFromDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const base = domain.split('.')[0].replace(/[-_]+/g, ' ');
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Multimodal calls must go to the Lovable AI Gateway (DeepSeek chat is text-only).
async function gatewayVision(body: Record<string, unknown>): Promise<Response> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('Vision extraction is not configured (missing LOVABLE_API_KEY).');
  return await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------- extraction

async function extractFromImage(fileBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  const response = await gatewayVision({
    model: 'google/gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Transcribe all readable text from this image of a news article or screenshot. Return only the raw text, keeping headline and paragraph structure. Ignore navigation, adverts and sidebars. If there is no meaningful text, return exactly NO_TEXT_FOUND.',
          },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${toBase64(fileBuffer)}` } },
        ],
      },
    ],
    max_tokens: 4000,
    temperature: 0,
  });

  if (!response.ok) {
    throw new Error(`Could not read this image (vision service returned ${response.status}).`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text || text.includes('NO_TEXT_FOUND')) {
    throw new Error('No readable text found in this image.');
  }
  return text;
}

async function extractFromPdf(fileBuffer: ArrayBuffer): Promise<string> {
  // 1. Text layer
  try {
    const { extractText, getDocumentProxy } = await import('https://esm.sh/unpdf@0.12.1');
    const pdf = await getDocumentProxy(new Uint8Array(fileBuffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join('\n') : text || '').trim();
    if (clean.split(/\s+/).filter(Boolean).length >= 60) return clean;
    console.log('📄 PDF text layer too thin, falling back to vision OCR');
  } catch (err) {
    console.warn('📄 PDF text-layer extraction failed, falling back to vision OCR', err);
  }

  // 2. Vision fallback for scanned PDFs (Gemini accepts PDFs as file blocks)
  const response = await gatewayVision({
    model: 'google/gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Transcribe all readable article text from this PDF. Return only the raw text, keeping headline and paragraph structure. If there is no meaningful text, return exactly NO_TEXT_FOUND.',
          },
          {
            type: 'file',
            file: { filename: 'upload.pdf', file_data: `data:application/pdf;base64,${toBase64(fileBuffer)}` },
          },
        ],
      },
    ],
    max_tokens: 8000,
    temperature: 0,
  });

  if (!response.ok) {
    throw new Error("Couldn't read this PDF — it may be an image-only scan we can't decode. Try uploading a screenshot instead.");
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text || text.includes('NO_TEXT_FOUND')) {
    throw new Error("Couldn't find any text in this PDF.");
  }
  return text;
}

async function extractFromDocx(fileBuffer: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import('https://esm.sh/jszip@3.10.1');
  const zip = await JSZip.loadAsync(fileBuffer);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error("Couldn't read this Word document.");
  const xml = await doc.async('string');
  const text = xml
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw new Error('This Word document appears to be empty.');
  return text;
}

function extractFromText(fileBuffer: ArrayBuffer): string {
  const text = new TextDecoder('utf-8').decode(fileBuffer).trim();
  if (!text) throw new Error('This text file is empty.');
  return text;
}

// ------------------------------------------------------------- structuring

async function structureContent(rawContent: string, hints: Partial<StoryDraft>): Promise<StoryDraft> {
  const today = new Date().toISOString().slice(0, 10);
  const fallback: StoryDraft = {
    headline: hints.headline || rawContent.split('\n').find((l) => l.trim())?.slice(0, 140) || 'Untitled story',
    author: hints.author || '',
    publication: hints.publication || '',
    publishedAt: hints.publishedAt || today,
    body: rawContent,
    sourceUrl: hints.sourceUrl,
  };

  try {
    const response = await llmFetch(
      {
        body: {
          model: 'deepseek-v4-flash',
          messages: [
            {
              role: 'system',
              content: `You clean up raw article text for an editorial pipeline. Return STRICT JSON only, no markdown fences, with keys:
{"headline": string, "author": string, "publication": string, "publishedAt": "YYYY-MM-DD", "body": string}

Rules:
- headline: the article's own headline. If none is present, write a plain factual one under 90 characters.
- author: the byline if present, else "".
- publication: the publication/masthead name if present, else "".
- publishedAt: the article's date if present, else "${today}".
- body: the full article text, OCR errors fixed, navigation/advert/UI junk removed, clean paragraphs separated by blank lines. Never summarise or shorten the reporting.`,
            },
            { role: 'user', content: rawContent.slice(0, 40000) },
          ],
          max_tokens: 8000,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        },
      },
      { context: 'manual-upload-structure' },
    );

    if (!response.ok) return fallback;
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(content);
    return {
      headline: (parsed.headline || fallback.headline).toString().trim(),
      author: (parsed.author || hints.author || '').toString().trim(),
      publication: (hints.publication || parsed.publication || '').toString().trim(),
      publishedAt: /^\d{4}-\d{2}-\d{2}/.test(parsed.publishedAt || '') ? parsed.publishedAt.slice(0, 10) : fallback.publishedAt,
      body: (parsed.body || rawContent).toString().trim(),
      sourceUrl: hints.sourceUrl,
    };
  } catch (err) {
    console.warn('⚠️ Structuring failed, returning raw draft', err);
    return fallback;
  }
}

// ------------------------------------------------------------------ commit

async function commitDraft(draft: StoryDraft, topicId: string, meta: Record<string, unknown>) {
  const body = (draft.body || '').trim();
  if (body.length < 50) throw new Error('Story body is too short to add (minimum 50 characters).');

  const headline = (draft.headline || 'Untitled story').trim();
  const sourceDomain = domainFromUrl(draft.sourceUrl)
    || (draft.publication ? draft.publication.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'manual');
  const stableKey = draft.sourceUrl || `manual://${topicId}/${crypto.randomUUID()}`;
  const publishedAt = /^\d{4}-\d{2}-\d{2}/.test(draft.publishedAt || '')
    ? new Date(draft.publishedAt).toISOString()
    : new Date().toISOString();

  const { data: existing } = await supabase
    .from('shared_article_content')
    .select('id')
    .eq('url', stableKey)
    .maybeSingle();

  let sharedContentId: string;
  if (existing) {
    sharedContentId = existing.id;
    await supabase
      .from('shared_article_content')
      .update({
        title: headline,
        body,
        author: draft.author || null,
        word_count: body.split(/\s+/).length,
        published_at: publishedAt,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', sharedContentId);
  } else {
    const { data: inserted, error } = await supabase
      .from('shared_article_content')
      .insert({
        url: stableKey,
        normalized_url: stableKey,
        title: headline,
        body,
        author: draft.author || null,
        word_count: body.split(/\s+/).length,
        language: 'en',
        source_domain: sourceDomain,
        published_at: publishedAt,
        last_seen_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to save story content: ${error.message}`);
    sharedContentId = inserted.id;
  }

  const { data: existingTopicArticle } = await supabase
    .from('topic_articles')
    .select('id')
    .eq('shared_content_id', sharedContentId)
    .eq('topic_id', topicId)
    .maybeSingle();

  if (existingTopicArticle) {
    return { articleId: existingTopicArticle.id, sharedContentId, duplicate: true };
  }

  const { data: topicArticle, error: topicError } = await supabase
    .from('topic_articles')
    .insert({
      shared_content_id: sharedContentId,
      topic_id: topicId,
      regional_relevance_score: 90,
      content_quality_score: 85,
      processing_status: 'new',
      import_metadata: {
        manual_upload: true,
        skip_locality_gate: true,
        publication: draft.publication || null,
        source_url: draft.sourceUrl || null,
        added_at: new Date().toISOString(),
        ...meta,
      },
    })
    .select('id')
    .single();

  if (topicError) throw new Error(`Failed to add story to arrivals: ${topicError.message}`);
  return { articleId: topicArticle.id, sharedContentId, duplicate: false };
}

// ------------------------------------------------------------------ handler

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return unauthorized(corsHeaders);

    const payload = await req.json();
    const { mode, topicId, commit, story, text, url, storageBucket, storagePath, fileName, fileType } = payload ?? {};

    if (!topicId || typeof topicId !== 'string') return fail('Topic ID is required', 400);
    if (!(await userOwnsTopic(supabase, user.id, topicId))) return forbidden(corsHeaders);

    // ---- commit path
    if (commit) {
      if (!story?.body) return fail('Story body is required', 400);
      const result = await commitDraft(story as StoryDraft, topicId, {
        mode: mode ?? 'paste',
        original_filename: fileName ?? null,
      });
      if (storageBucket && storagePath) {
        await supabase.storage.from(storageBucket).remove([storagePath]).catch(() => {});
      }
      return json({ success: true, ...result });
    }

    // ---- extract path
    let rawContent = '';
    const hints: Partial<StoryDraft> = {};

    if (mode === 'paste') {
      if (!text || text.trim().length < 50) return fail('Paste at least 50 characters of article text.', 400);
      rawContent = text.trim();
    } else if (mode === 'link') {
      if (!url) return fail('A URL is required.', 400);
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return fail('That does not look like a valid URL.', 400);
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) return fail('Only http(s) links are supported.', 400);
      let html: string;
      try {
        html = await fetchWithRetry(parsed.toString(), 2);
      } catch (err: any) {
        return fail(`Couldn't fetch that page (${err?.message ?? 'network error'}). Try pasting the text instead.`);
      }
      const extracted = extractContentFromHTML(html, parsed.toString());
      if (!extracted?.body || extracted.body.trim().length < 100) {
        return fail("Couldn't read the article from that page. Try pasting the text instead.");
      }
      rawContent = extracted.body;
      hints.headline = extracted.title;
      hints.author = extracted.author;
      hints.publishedAt = extracted.published_at?.slice(0, 10);
      hints.sourceUrl = parsed.toString();
      hints.publication = titleCaseFromDomain(domainFromUrl(parsed.toString()));
    } else if (mode === 'file') {
      if (!storageBucket || !storagePath) return fail('File location is required.', 400);
      const { data: blob, error: downloadError } = await supabase.storage.from(storageBucket).download(storagePath);
      if (downloadError || !blob) return fail(`Couldn't read the uploaded file: ${downloadError?.message ?? 'not found'}`);
      const buffer = await blob.arrayBuffer();
      if (buffer.byteLength > 20 * 1024 * 1024) return fail('File exceeds the 20MB limit.');

      const type = (fileType || blob.type || '').toLowerCase();
      const name = (fileName || storagePath).toLowerCase();

      try {
        if (type.startsWith('image/')) {
          rawContent = await extractFromImage(buffer, type);
        } else if (type === 'application/pdf' || name.endsWith('.pdf')) {
          rawContent = await extractFromPdf(buffer);
        } else if (name.endsWith('.docx') || type.includes('officedocument.wordprocessingml')) {
          rawContent = await extractFromDocx(buffer);
        } else if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
          rawContent = extractFromText(buffer);
        } else {
          return fail(`Unsupported file type: ${type || 'unknown'}. Use an image, PDF, Word document or text file.`);
        }
      } catch (err: any) {
        return fail(err?.message ?? 'Extraction failed.');
      }
      hints.headline = (fileName || '').replace(/\.[^/.]+$/, '');
    } else {
      return fail('Unknown mode.', 400);
    }

    if (!rawContent || rawContent.trim().length < 50) {
      return fail('Not enough readable content was found.');
    }

    const draft = await structureContent(rawContent, hints);
    return json({ success: true, draft });
  } catch (error: any) {
    console.error('❌ Manual content error:', error);
    return json({ success: false, error: error?.message || 'Something went wrong' }, 500);
  }
});
