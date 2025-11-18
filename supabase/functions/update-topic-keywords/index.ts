import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topicId, keywords } = await req.json();

    if (!topicId || !keywords || !Array.isArray(keywords)) {
      return new Response(
        JSON.stringify({ error: 'topicId and keywords array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the topic keywords
    const { data, error } = await supabase
      .from('topics')
      .update({ 
        keywords,
        updated_at: new Date().toISOString()
      })
      .eq('id', topicId)
      .select('id, name, keywords')
      .single();

    if (error) {
      console.error('Error updating keywords:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Updated keywords for topic ${data.name}: ${keywords.length} keywords`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        topic: data,
        keywordCount: keywords.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in update-topic-keywords:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
