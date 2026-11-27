import { ToolError, type ToolContext } from '@lovable.dev/mcp-js';
import { startCall, requireAllowance } from './gate';
import type { supabaseForUser } from './supabase';
export const STUDIO_URL = 'https://curatr.pro';
export const previewUrl = (slug: string) => `${STUDIO_URL}/studio/preview/${encodeURIComponent(slug)}`;
export async function beginWrite(ctx: ToolContext, tool: string, feedId?: string, credits=0) {
  const db = await startCall(ctx,tool);
  await requireAllowance(ctx,db,credits>0?'image':'setup',credits,{tool,...(feedId ? {feedId} : {})});
  return db;
}
export async function ownFeed(db: ReturnType<typeof supabaseForUser>, feedId: string, ctx: ToolContext) {
  const {data,error} = await db.from('topics').select('id,name,slug,created_by,is_public,branding_config,topic_type,region')
    .eq('id',feedId).eq('created_by',ctx.getUserId()).eq('is_archived',false).single();
  if(error || !data) throw new ToolError('That feed is not one you own.');
  return data;
}
export async function logResult(db: ReturnType<typeof supabaseForUser>, tool: string, feedId: string, outcome='ok') {
  const {error}=await db.rpc('mcp_studio_result',{p_tool:tool,p_topic_id:feedId,p_outcome:outcome});
  if(error) throw new ToolError('The change was saved, but its activity could not be recorded. Check the preview before trying again.');
}
export function toolFailure(error: unknown): never {
  if(error instanceof ToolError) throw error;
  throw new ToolError(error instanceof Error ? error.message : 'The change could not be saved. Try again.');
}
