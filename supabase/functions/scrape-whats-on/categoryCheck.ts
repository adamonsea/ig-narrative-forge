/**
 * Category fallback — runs in the background after events are saved, never during
 * a gather. Events the rules left as "Other" (and the owner hasn't set) are asked
 * about once, in one short model call per source; the answer must be one of the
 * feed's own categories or it stays "Other". Owner choices are never touched.
 */
import { llmFetch } from '../_shared/llm-router.ts';
import { STARTING_EVENT_CATEGORIES, SPARE_EVENT_CATEGORIES } from '../_shared/eventCategories.ts';
import { londonToday } from './extract.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
const MAX_TITLES = 40;

const key = (t: string) => t.trim().toLowerCase();

/** The categories this feed may use: the starting ten plus any spare ones it added. */
export function allowedCategories(added: readonly string[]): string[] {
  return [...STARTING_EVENT_CATEGORIES, ...SPARE_EVENT_CATEGORIES.filter((c) => added.includes(c))];
}

/** The model's answer → category per question number; anything not allowed is dropped. */
export function readAnswers(raw: string, count: number, allowed: readonly string[]): Map<number, string> {
  const out = new Map<number, string>();
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return out; }
  const list = Array.isArray(data) ? data : (data as { results?: unknown })?.results;
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    const i = Number((item as { i?: unknown })?.i);
    const c = String((item as { category?: unknown })?.category ?? '').toLowerCase().trim();
    if (Number.isInteger(i) && i >= 0 && i < count && allowed.includes(c)) out.set(i, c);
  }
  return out;
}

export async function checkOtherCategories(supabase: Db, topicId: string, sourceId: string): Promise<number> {
  const { data } = await supabase.from('events').select('id, title, description, location')
    .eq('event_source_id', sourceId).eq('event_type', 'other').eq('category_locked', false).eq('category_ai_checked', false)
    .gte('start_date', londonToday()).limit(400);
  const rows = (data || []) as { id: string; title: string; description: string | null; location: string | null }[];
  if (!rows.length) return 0;

  // One question per event name (repeat dates share the answer)
  const byTitle = new Map<string, typeof rows>();
  for (const r of rows) byTitle.set(key(r.title), [...(byTitle.get(key(r.title)) || []), r]);
  const groups = [...byTitle.values()].slice(0, MAX_TITLES);

  const { data: addedRows } = await supabase.from('topic_event_categories').select('category').eq('topic_id', topicId).eq('state', 'added');
  const allowed = allowedCategories((addedRows || []).map((r: { category: string }) => r.category));

  const lines = groups.map((g, i) => {
    const r = g[0];
    return `${i}. ${r.title}${r.location ? ` | ${r.location}` : ''}${r.description ? ` | ${r.description.slice(0, 160)}` : ''}`;
  });
  const resp = await llmFetch({
    body: {
      model: 'deepseek-v4-flash',
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `You sort event listings into categories. Allowed: ${allowed.join(', ')}, other. Use "other" unless one clearly fits. Reply with JSON only: {"results":[{"i":0,"category":"music"}]}` },
        { role: 'user', content: lines.join('\n') },
      ],
    },
  }, { context: 'event-category-check' });
  if (!resp.ok) return 0; // try again after the next gather
  const json = await resp.json().catch(() => null);
  const answers = readAnswers(String(json?.choices?.[0]?.message?.content ?? ''), groups.length, allowed);

  let placed = 0;
  const byCategory = new Map<string, string[]>();
  groups.forEach((g, i) => {
    const c = answers.get(i);
    if (c) byCategory.set(c, [...(byCategory.get(c) || []), ...g.map((r) => r.id)]);
  });
  for (const [category, ids] of byCategory) {
    // Only rows still "Other" and not set by the owner in the meantime
    const { count } = await supabase.from('events').update({ event_type: category }, { count: 'exact' })
      .in('id', ids).eq('event_type', 'other').eq('category_locked', false);
    placed += count ?? 0;
  }
  const asked = groups.flatMap((g) => g.map((r) => r.id));
  for (let i = 0; i < asked.length; i += 150) {
    await supabase.from('events').update({ category_ai_checked: true }).in('id', asked.slice(i, i + 150));
  }
  console.log(`category check ${sourceId}: asked ${groups.length}, placed ${placed}`);
  return placed;
}

/** Run after the response; never holds up a gather. */
export function inBackground(task: Promise<unknown>) {
  const safe = task.catch((e) => console.warn('category check failed:', e instanceof Error ? e.message : e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(safe);
}
