import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function verifyTopicOwnership(authHeader: string, topicId: string) {
  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing or invalid Authorization header' };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) return { userId: null, error: 'Invalid or expired token' };
  const userId = claimsData.claims.sub as string;

  if (!topicId || typeof topicId !== 'string') return { userId: null, error: 'A topic id is required' };

  // Service role for the ownership lookup so a restrictive row policy can't
  // make the owner's own feed look missing.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: topic, error: topicError } = await serviceClient
    .from('topics')
    .select('id, created_by')
    .eq('id', topicId)
    .maybeSingle();
  if (topicError) {
    console.error('Topic lookup failed:', topicError.message);
    return { userId: null, error: 'Could not verify this feed' };
  }
  if (!topic) return { userId: null, error: 'Topic not found' };
  if (topic.created_by !== userId) {
    const { data: isAdmin } = await serviceClient.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) return { userId: null, error: 'Not authorized to manage this topic' };
  }
  return { userId, error: null };
}

/** Wikimedia Commons image search. Fail-open: returns [] on any problem. */
async function searchCommons(query: string) {
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: '6',
      gsrlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      iiurlwidth: '480',
      origin: '*',
    });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'curatr-landmark-photos/1.0 (https://curatr.pro)' },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    const pages = json?.query?.pages ? Object.values(json.query.pages) : [];

    const results: Array<{ url: string; thumbUrl: string; credit: string; title: string }> = [];
    for (const page of pages as any[]) {
      const info = page?.imageinfo?.[0];
      if (!info?.url) continue;
      const mime = info.mime || '';
      if (mime && !/jpeg|jpg|png|webp/i.test(mime)) continue;
      const meta = info.extmetadata || {};
      const artist = String(meta.Artist?.value || '').replace(/<[^>]*>/g, '').trim();
      const licence = String(meta.LicenseShortName?.value || '').trim();
      results.push({
        url: info.url,
        thumbUrl: info.thumburl || info.url,
        credit: [artist, licence].filter(Boolean).join(' · ') || 'Wikimedia Commons',
        title: String(page.title || '').replace(/^File:/, ''),
      });
      if (results.length >= 8) break;
    }
    return results;
  } catch (error) {
    console.warn('Commons search failed:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { topicId, mode, landmark, region, sourceUrl, credit, fileBase64, contentType } = body ?? {};

    if (!topicId || typeof topicId !== 'string') throw new Error('topicId is required');

    const authHeader = req.headers.get('Authorization') || '';
    const { error: authError } = await verifyTopicOwnership(authHeader, topicId);
    if (authError) {
      return new Response(JSON.stringify({ success: false, error: authError }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'search') {
      if (!landmark || typeof landmark !== 'string') throw new Error('landmark is required');
      const query = [landmark, region].filter(Boolean).join(' ');
      const results = await searchCommons(query);
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'import') {
      let bytes: Uint8Array;
      let type = typeof contentType === 'string' && contentType ? contentType : 'image/jpeg';

      if (typeof fileBase64 === 'string' && fileBase64.length > 0) {
        const raw = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
        const binary = atob(raw);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else if (typeof sourceUrl === 'string' && /^https?:\/\//i.test(sourceUrl)) {
        const res = await fetch(sourceUrl, {
          headers: { 'User-Agent': 'curatr-landmark-photos/1.0 (https://curatr.pro)' },
        });
        if (!res.ok) throw new Error(`Could not fetch that image (${res.status})`);
        bytes = new Uint8Array(await res.arrayBuffer());
        type = res.headers.get('content-type') || type;
      } else {
        throw new Error('Provide either an uploaded file or an image link');
      }

      if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('That image is larger than 8MB');
      if (!/^image\//.test(type)) throw new Error('That link is not an image');

      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const safeName = String(landmark || 'place').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const path = `landmark-refs/${topicId}/${safeName}-${Date.now()}.${ext}`;

      const admin = createClient(supabaseUrl, serviceRoleKey);
      const { error: uploadError } = await admin.storage
        .from('visuals')
        .upload(path, bytes, { contentType: type, upsert: true });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const url = `${supabaseUrl}/storage/v1/object/public/visuals/${path}`;
      return new Response(
        JSON.stringify({ success: true, url, credit: typeof credit === 'string' ? credit.slice(0, 200) : '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    throw new Error("mode must be 'search' or 'import'");
  } catch (error) {
    console.error('landmark-photos error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
