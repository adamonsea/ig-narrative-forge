import type { SupabaseClient } from '@supabase/supabase-js';
import { callFeedService } from './services';
export interface OwnerStoryDraft { headline:string; author:string; publication:string; publishedAt:string; body:string; sourceUrl?:string | undefined }
export function readOwnerStory(db: SupabaseClient, body: Record<string,unknown>) {
  return callFeedService<{success:boolean;draft:OwnerStoryDraft}>(db,'extract-content-from-upload',body);
}
export function commitOwnerStory(db: SupabaseClient, body: Record<string,unknown>) {
  return callFeedService<{success:boolean;articleId:string;duplicate:boolean}>(db,'extract-content-from-upload',{...body,commit:true});
}
