import type { SupabaseClient } from '@supabase/supabase-js';
import { edgeErrorMessage } from '../edgeError';

/** Existing owner services, always called using the caller's Supabase client. */
export async function callFeedService<T>(db: SupabaseClient, name: string, body: Record<string,unknown>): Promise<T> {
  const {data,error} = await db.functions.invoke(name,{body});
  if (error) throw new Error(await edgeErrorMessage(error));
  if (data?.error || data?.success === false) throw new Error(data.error || 'The change could not be saved.');
  return data as T;
}
export function saveFeedLook(db: SupabaseClient, topicId: string, values: Record<string,unknown>) {
  return db.from('topics').update({...values,updated_at:new Date().toISOString()}).eq('id',topicId);
}
export async function setFeedPin(db: SupabaseClient, topicId: string, storyId: string | null, hours: number) {
  const {data,error} = await db.rpc('set_story_pin',{p_topic_id:topicId,p_story_id:storyId,p_hours:hours});
  if(error) throw error;
  return data;
}
/** Schedules the existing automation runner rather than creating a second job system. */
export async function queueFirstGather(db: SupabaseClient, topicId: string) {
  const {error} = await db.from('topic_automation_settings').update({next_run_at:new Date().toISOString()}).eq('topic_id',topicId);
  if(error) throw error;
}
