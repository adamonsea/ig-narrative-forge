/**
 * Editorial copy for one event on a feed whose editorial profile is on.
 * Code copies/converts every fact and assembles captions; the model only writes the synopsis
 * per language and suggests subtitle, festival, extra facts, genre, hashtags and ticket facts,
 * each checked against the source. Hand-edited fields are never touched.
 * Charged 1 credit per event, once per source-facts fingerprint. dryRun: no writes, no charge.
 * Callers authorise first; `db` is a service-role client.
 */
import { z } from 'npm:zod@3';
import { createOpenAI } from 'npm:@ai-sdk/openai@4';
import { streamText, Output } from 'npm:ai@7';
import { assembleCaption, captionFields, cleanHashtags, factsHash, ticketNote } from './caption.ts';
import { deriveFlags, factFlags, keepModelFlag, mapGenre, synopsisFlags, type FlagRule, type GenreRule } from './rules.ts';

const AI_BASE_URL = 'https://ai.gateway.lovable.dev/v1';
const AI_MODEL = 'openai/gpt-6-astra';
export const EVENT_COPY_CREDITS = 1;

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Row = any;

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const inSource = (v: string | null | undefined, src: string) => Boolean(v && norm(v) && ` ${norm(src)} `.includes(` ${norm(v)} `));
const lisbonDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

function schema(languages: string[]) {
  return z.object({
    synopsis: z.object(Object.fromEntries(languages.map((l) => [l, z.string()]))),
    subtitle: z.object({ text: z.string().nullable(), copied_from_source: z.boolean() }),
    festival: z.string().nullable(),
    extra_facts: z.string().nullable(),
    genre: z.string().nullable(),
    event_hashtags: z.array(z.string()),
    ticket: z.object({
      collection_offset: z.string().nullable(), collection_time: z.string().nullable(),
      max_per_person: z.number().nullable(), subject_to_capacity: z.boolean().nullable(), other: z.string().nullable(),
    }),
    age_limit: z.string().nullable(),
    review_flags: z.array(z.string()),
  });
}

async function suggest(e: Row, profile: Row, sourceText: string, postDate: string) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('AI not configured');
  const languages: string[] = profile.languages;
  const genres = (profile.genres as GenreRule[]).map((g) => g.name);
  const provider = createOpenAI({ baseURL: AI_BASE_URL, apiKey, headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' } });
  const system = [
    'You write event listings copy. Facts (date, time, venue, price, age limit, tickets) are NEVER yours to state: copy only what the SOURCE says; never infer or research them.',
    `Write a synopsis in each language, in this order: ${languages.join(', ')}. Each is exactly 2 sentences, about 40–60 words, never cut off.`,
    'Order: context first (if part of a festival or season, open with it and its dates as given), then what it is and who (one placing fact such as nationality, ensemble or genre), then why go (one concrete hook from the source).',
    'One container only: never mention a strand or series inside a festival.',
    `Use "hoje"/"today" only if the event date equals the posting date (${postDate}); otherwise give the date.`,
    'If the original-language title differs from the title used, name it once in brackets in the Portuguese synopsis only.',
    'Each language says the same thing in natural phrasing, not word for word.',
    'Paraphrase completely: never reuse a sentence or any run of 6+ consecutive words from the source, in any language. Names of works, composers, performers, venues and festivals may be kept as written; everything around them must be your own words and structure.',
    'Portuguese means European Portuguese (pt-PT), never Brazilian.',
    'No promotional words, no exclamation marks, no rhetorical questions, never "Don\'t miss".',
    ...((profile.voice_rules as string[]) ?? []).map((r) => `Voice: ${r}`),
    'subtitle: the English (or original) title if the SOURCE gives one different from the title (copied_from_source true, copied exactly). Only if the source has none may you propose an English title (copied_from_source false). Null when it would equal the title.',
    'festival: the festival or season name exactly as written in the source, else null.',
    'extra_facts: one line of buyer facts stated in the source (premiere, Q&A, age limit, sold out, last days): Portuguese items joined by " · ", then " / ", then the English items. Null if none.',
    `genre: exactly one of: ${genres.join(', ')}.`,
    `event_hashtags: ${profile.event_hashtag_min}–${profile.event_hashtag_max} specific tags (genre, venue, festival), lower case, no accents, no #.`,
    'ticket: ticket collection rules exactly as the source states them (e.g. collection_offset "2 hours before"), else nulls.',
    'review_flags: in English, at most 3, each under 6 words, only for a missing or ambiguous fact or a judgement call (e.g. "Festival dates unclear"). Never flag time, price, currency or cut-off text: code checks those.',
  ].join('\n');
  const prompt = `POSTING DATE: ${postDate}\nEVENT DATE: ${e.end_date && e.end_date > e.start_date ? (e.run_start ?? e.start_date) : e.start_date}${e.end_date ? ` to ${e.end_date}` : ''}\nSOURCE:\n${sourceText}`;
  const result = streamText({
    model: provider.responses(AI_MODEL), system, prompt,
    output: Output.object({ schema: schema(languages) }),
    providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', include: ['reasoning.encrypted_content'], strictJsonSchema: true } },
  });
  return await result.output;
}

export interface EventCopyResult {
  skipped?: string;
  error?: string;
  event_id?: string;
  title?: string;
  captions?: Record<string, string>;
  synopsis?: Record<string, string>;
  subtitle?: string | null;
  festival?: string | null;
  genre?: string | null;
  flags?: string[];
  event_hashtags?: string[];
  ticket_note?: string | null;
  age_limit?: string | null;
  extra_facts?: string | null;
  review_flags?: string[];
}

export async function generateEventCopy(db: Db, opts: { eventId: string; dryRun?: boolean; force?: boolean; postDate?: string }): Promise<EventCopyResult> {
  const { eventId: event_id, dryRun = false, force = false } = opts;
  const postDate = opts.postDate ?? lisbonDate();
  const { data: e } = await db.from('events').select('*').eq('id', event_id).maybeSingle();
  if (!e) return { error: 'Not found' };
  const [{ data: profile }, { data: topic }, { data: lockRows }, { data: copyRows }, { data: capRows }] = await Promise.all([
    db.from('feed_editorial_profiles').select('*').eq('topic_id', e.topic_id).maybeSingle(),
    db.from('topics').select('created_by, event_currency').eq('id', e.topic_id).maybeSingle(),
    db.from('event_field_edits').select('field').eq('event_id', event_id),
    db.from('event_copy').select('*').eq('event_id', event_id),
    db.from('event_captions').select('*').eq('event_id', event_id),
  ]);
  if (!profile?.enabled) return { skipped: 'profile off' };
  if (!dryRun && e.status !== 'published') return { skipped: 'not approved' };

  const locked = new Set<string>((lockRows ?? []).map((r: Row) => r.field));
  const copy = new Map<string, Row>((copyRows ?? []).map((r: Row) => [`${r.kind}|${r.language}`, r]));
  const hash: string = e.source_hash ?? factsHash(e);
  const languages: string[] = profile.languages;
  const upToDate = languages.every((l) => { const r = copy.get(`synopsis|${l}`); return r && (r.edited_at || r.source_hash === hash); });
  if (!dryRun && !force && upToDate) return { skipped: 'facts unchanged' };

  const sourceText = [`Title: ${e.title}`, e.location && `Venue: ${e.location}`, e.start_time && `Time: ${e.start_time}`,
    e.is_free ? 'Price: free' : e.price && `Price: ${e.price}`, e.source_tags?.length && `Tags: ${e.source_tags.join(', ')}`,
    e.source_subtitle && `Other-language title: ${e.source_subtitle}`, e.category && `Category: ${e.category}`, e.description && `Description: ${e.description}`].filter(Boolean).join('\n');
  const ai = await suggest(e, profile, sourceText, postDate);
  if (!ai) throw new Error('No AI output');

  const flags: string[] = [];
  const keep = <T>(field: string, mine: T, theirs: T): T => (locked.has(field) ? mine : theirs);
  const festival: string | null = keep('festival', e.festival, inSource(ai.festival, sourceText) ? ai.festival : null);
  if (ai.festival && !festival && !locked.has('festival')) flags.push('Festival not in source');
  const subRow = copy.get('subtitle|');
  // A title the source gives in another language is copied as a fact; only without one may the model propose
  const sourceSub: string | null = e.source_subtitle?.trim() || null;
  let subtitle: string | null = subRow?.edited_at ? subRow.text : sourceSub ?? ai.subtitle.text;
  if (!subRow?.edited_at && sourceSub) {
    if (norm(sourceSub) === norm(festival || e.title)) subtitle = null;
  } else if (!subRow?.edited_at && subtitle) {
    if (norm(subtitle) === norm(festival || e.title)) subtitle = null;
    else if (!(ai.subtitle.copied_from_source && inSource(subtitle, sourceText))) flags.push('Subtitle written by Curatr');
  }
  let genre: string | null = keep('genre', e.genre, mapGenre(profile.genres, [...(e.source_tags ?? []), e.category, e.event_type]));
  if (!genre) {
    const names = (profile.genres as GenreRule[]).map((g) => g.name);
    genre = names.includes(ai.genre ?? '') ? ai.genre : names[0] ?? null;
    flags.push('Genre is a judgement call');
  }
  const evFlags: string[] = keep('flags', e.flags, deriveFlags(profile.flag_rules as Record<string, FlagRule>, { is_free: e.is_free, festival, source_tags: e.source_tags, sourceText }));
  const tags: string[] = keep('event_hashtags', e.event_hashtags, cleanHashtags(ai.event_hashtags, profile.event_hashtag_max).map((t) => t.slice(1)));
  if (tags.length < profile.event_hashtag_min) flags.push('Few event hashtags');
  const t = ai.ticket;
  const ticketOk = inSource(t.collection_offset, sourceText) || inSource(t.collection_time, sourceText);
  const ticket_note: string | null = keep('ticket_note', e.ticket_note, ticketOk ? ticketNote(t, e.start_time) : null);
  const age_limit: string | null = keep('age_limit', e.age_limit, inSource(ai.age_limit, sourceText) ? ai.age_limit : null);
  const extraRow = copy.get('extra_facts|');
  const extra_facts: string | null = extraRow?.edited_at ? extraRow.text : ai.extra_facts;
  const synopsis: Record<string, string> = {};
  for (const l of languages) {
    const row = copy.get(`synopsis|${l}`);
    synopsis[l] = row?.edited_at ? row.text : (ai.synopsis as Record<string, string>)[l] ?? '';
    if (!row?.edited_at) flags.push(...synopsisFlags(synopsis[l]!, l, { sourceText, eventDate: e.start_date, postDate }));
  }
  const review_flags = [...new Set([...factFlags(e, topic?.event_currency), ...flags, ...ai.review_flags.filter(keepModelFlag).slice(0, 3).map((f) => f.slice(0, 60))])];

  const fields = captionFields({ ...e, festival, subtitle, extra_facts, ticket_note, event_hashtags: tags, synopsis },
    { languages, fixed_hashtags: profile.fixed_hashtags, event_hashtag_max: profile.event_hashtag_max, labels: profile.labels ?? {} }, topic?.event_currency, postDate);
  const caps = new Map<string, Row>((capRows ?? []).map((r: Row) => [r.platform, r]));
  const captions: Record<string, string> = {};
  for (const [platform, tpl] of Object.entries(profile.caption_templates as Record<string, string[]>)) {
    const prev = caps.get(platform);
    captions[platform] = prev?.edited_at ? prev.text : assembleCaption(tpl, fields);
  }
  const out: EventCopyResult = { event_id, title: e.title, captions, synopsis, subtitle, festival, genre, flags: evFlags, event_hashtags: tags, ticket_note, age_limit, extra_facts, review_flags };
  if (dryRun) return out;

  const key = `event-copy:${event_id}:${hash}`;
  const { data: reserve, error: rErr } = await db.rpc('reserve_user_credits', { p_user_id: topic!.created_by, p_amount: EVENT_COPY_CREDITS, p_idempotency_key: key, p_description: 'Event copy', p_story_id: null });
  if (rErr || !reserve?.success) return { error: 'Not enough credits' };
  try {
    const now = new Date().toISOString();
    const upd: Record<string, unknown> = { review_flags, approved_at: e.approved_at ?? now };
    for (const [k, v] of Object.entries({ festival, genre, flags: evFlags, event_hashtags: tags, ticket_note, age_limit })) if (!locked.has(k)) upd[k] = v;
    const w1 = await db.from('events').update(upd).eq('id', event_id);
    if (w1.error) throw w1.error;
    const copyUp = [
      ...languages.filter((l) => !copy.get(`synopsis|${l}`)?.edited_at).map((l) => ({ event_id, language: l, kind: 'synopsis', text: synopsis[l], source_hash: hash, generated_at: now })),
      ...(!subRow?.edited_at ? [{ event_id, language: '', kind: 'subtitle', text: subtitle ?? '', source_hash: hash, generated_at: now }] : []),
      ...(!extraRow?.edited_at ? [{ event_id, language: '', kind: 'extra_facts', text: extra_facts ?? '', source_hash: hash, generated_at: now }] : []),
    ];
    const w2 = await db.from('event_copy').upsert(copyUp, { onConflict: 'event_id,language,kind' });
    if (w2.error) throw w2.error;
    const capUp = Object.entries(captions).filter(([p]) => !caps.get(p)?.edited_at).map(([platform, text]) => ({ event_id, platform, language: '', text, source_hash: hash }));
    if (capUp.length) { const w3 = await db.from('event_captions').upsert(capUp, { onConflict: 'event_id,platform,language' }); if (w3.error) throw w3.error; }
    await db.rpc('settle_credit_reservation', { p_user_id: topic!.created_by, p_idempotency_key: key });
  } catch (err) {
    await db.rpc('release_credit_reservation', { p_user_id: topic!.created_by, p_idempotency_key: key });
    throw err;
  }
  return out;
}
