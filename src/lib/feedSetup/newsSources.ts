import type { SupabaseClient } from '@supabase/supabase-js';

/** One news-source save for onboarding, Sources and Studio; topic_id is always supplied. */
export async function createNewsSource(db: SupabaseClient, values: Record<string,unknown>, topicId: string) {
  const {data,error} = await db.from('content_sources').insert({...values,topic_id:topicId}).select('id').single();
  if(error) throw error;
  if(!data) throw new Error('The source could not be saved.');
  return String(data.id);
}
