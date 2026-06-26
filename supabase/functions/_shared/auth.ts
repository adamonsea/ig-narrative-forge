import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export interface AuthedUser {
  id: string;
  email?: string;
}

/** Verify the Bearer JWT and return the authenticated user, or null. */
export async function getUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/** Check if a user has the admin role. */
export async function isAdmin(service: any, userId: string): Promise<boolean> {
  const { data } = await service
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!data;
}

/** Check if a user owns a topic (creator) or is an admin. */
export async function userOwnsTopic(service: any, userId: string, topicId: string): Promise<boolean> {
  const { data } = await service
    .from('topics')
    .select('created_by')
    .eq('id', topicId)
    .maybeSingle();
  if (data?.created_by === userId) return true;
  return await isAdmin(service, userId);
}

/** Resolve the owning topic_id for a story via its article chain. */
export async function topicIdForStory(service: any, storyId: string): Promise<string | null> {
  const { data: story } = await service
    .from('stories')
    .select('article_id, topic_article_id')
    .eq('id', storyId)
    .maybeSingle();
  if (!story) return null;
  if (story.topic_article_id) {
    const { data } = await service
      .from('topic_articles')
      .select('topic_id')
      .eq('id', story.topic_article_id)
      .maybeSingle();
    if (data?.topic_id) return data.topic_id;
  }
  if (story.article_id) {
    const { data } = await service
      .from('articles')
      .select('topic_id')
      .eq('id', story.article_id)
      .maybeSingle();
    if (data?.topic_id) return data.topic_id;
  }
  return null;
}

export function unauthorized(corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function forbidden(corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** True when the caller presents the service-role key (internal/cron callers). */
export function isServiceRole(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return false;
  if (authHeader === `Bearer ${serviceKey}`) return true;
  if (apikey === serviceKey) return true;
  return false;
}
