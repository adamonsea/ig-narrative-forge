import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StoryCategory {
  id: string;
  topic_id: string | null;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface CategorySetting {
  id?: string;
  topic_id: string;
  category_id: string;
  enabled: boolean;
  geographic_radius_miles: number | null;
  relevance_threshold: number | null;
  automation_mode: string;
}

export interface CategoryCount {
  category_id: string;
  count: number;
}

export const useStoryCategories = (topicId?: string) => {
  const [categories, setCategories] = useState<StoryCategory[]>([]);
  const [settings, setSettings] = useState<Record<string, CategorySetting>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [classifiedCount, setClassifiedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!topicId) return;
    setLoading(true);
    try {
      const [{ data: cats }, { data: setts }, { data: assignments }] = await Promise.all([
        supabase
          .from('story_categories')
          .select('id, topic_id, parent_id, slug, name, description, sort_order')
          .or(`topic_id.is.null,topic_id.eq.${topicId}`)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('topic_category_settings').select('*').eq('topic_id', topicId),
        supabase.from('story_category_assignments').select('category_id').eq('topic_id', topicId).limit(20000),
      ]);

      setCategories((cats ?? []) as StoryCategory[]);

      const settingMap: Record<string, CategorySetting> = {};
      for (const s of setts ?? []) settingMap[s.category_id] = s as CategorySetting;
      setSettings(settingMap);

      const countMap: Record<string, number> = {};
      for (const a of assignments ?? []) countMap[a.category_id] = (countMap[a.category_id] ?? 0) + 1;
      setCounts(countMap);
      setClassifiedCount((assignments ?? []).length);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSetting = useCallback(
    async (categoryId: string, patch: Partial<CategorySetting>) => {
      if (!topicId) return;
      const existing = settings[categoryId];
      const row = {
        topic_id: topicId,
        category_id: categoryId,
        enabled: patch.enabled ?? existing?.enabled ?? true,
        geographic_radius_miles: patch.geographic_radius_miles ?? existing?.geographic_radius_miles ?? null,
        relevance_threshold: patch.relevance_threshold ?? existing?.relevance_threshold ?? null,
        automation_mode: patch.automation_mode ?? existing?.automation_mode ?? 'inherit',
      };
      setSettings((prev) => ({ ...prev, [categoryId]: { ...row, id: existing?.id } }));
      const { error } = await supabase
        .from('topic_category_settings')
        .upsert(row, { onConflict: 'topic_id,category_id' });
      if (error) throw error;
    },
    [topicId, settings]
  );

  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  return { categories, parents, childrenOf, settings, counts, classifiedCount, loading, reload: load, saveSetting };
};
