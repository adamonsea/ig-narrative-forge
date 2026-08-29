// Shared helpers for the story categorisation system.

export interface CategoryRow {
  id: string;
  topic_id: string | null;
  parent_id: string | null;
  slug: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

/**
 * Load the taxonomy available to a topic: the shared global set plus any
 * feed-specific categories. Feed-specific slugs win over global ones.
 */
export async function loadTaxonomy(service: any, topicId: string): Promise<CategoryRow[]> {
  const { data, error } = await service
    .from('story_categories')
    .select('id, topic_id, parent_id, slug, name, description, is_active')
    .or(`topic_id.is.null,topic_id.eq.${topicId}`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Failed to load taxonomy: ${error.message}`);

  const bySlug = new Map<string, CategoryRow>();
  for (const row of (data ?? []) as CategoryRow[]) {
    const existing = bySlug.get(row.slug);
    if (!existing || (row.topic_id && !existing.topic_id)) bySlug.set(row.slug, row);
  }
  return Array.from(bySlug.values());
}

/** Render the taxonomy as a compact prompt-friendly tree. */
export function taxonomyPrompt(categories: CategoryRow[]): string {
  const parents = categories.filter((c) => !c.parent_id);
  const children = categories.filter((c) => c.parent_id);
  return parents
    .map((p) => {
      const subs = children.filter((c) => c.parent_id === p.id);
      const subText = subs.length ? ` [sub: ${subs.map((s) => s.slug).join(', ')}]` : '';
      return `- ${p.slug} — ${p.name}${p.description ? `: ${p.description}` : ''}${subText}`;
    })
    .join('\n');
}

/** Strip markdown fences and parse JSON from an LLM response. */
export function parseJson<T>(raw: string): T {
  let text = (raw ?? '').trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = text.search(/[[{]/);
  if (first > 0) text = text.slice(first);
  const lastArr = text.lastIndexOf(']');
  const lastObj = text.lastIndexOf('}');
  const last = Math.max(lastArr, lastObj);
  if (last > -1) text = text.slice(0, last + 1);
  return JSON.parse(text) as T;
}

/**
 * Tolerant JSON parse for LLM output that may be truncated by max_tokens.
 * Falls back to closing any open strings/brackets and dropping the trailing
 * incomplete element so we still recover the categories produced so far.
 */
export function parseJsonSalvage<T>(raw: string): T {
  try {
    return parseJson<T>(raw);
  } catch {
    let text = (raw ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const first = text.search(/[[{]/);
    if (first > 0) text = text.slice(first);

    // Walk the text tracking structure; remember the last position where the
    // document could be safely closed (end of a complete array/object element).
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let safeEnd = -1;
    let safeStack: string[] = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
      else if (ch === '}' || ch === ']') {
        stack.pop();
        if (stack.length > 0) {
          safeEnd = i;
          safeStack = [...stack];
        }
      }
    }

    if (safeEnd === -1) throw new Error('Unable to salvage JSON from model output');
    const closed = text.slice(0, safeEnd + 1) + safeStack.reverse().join('');
    return JSON.parse(closed) as T;
  }
}
