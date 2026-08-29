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
