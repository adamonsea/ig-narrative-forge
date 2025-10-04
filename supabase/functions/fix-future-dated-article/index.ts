import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fix the future-dated TK Maxx article
    const { data: updatedArticle, error: updateError } = await supabase
      .from('articles')
      .update({
        published_at: '2024-08-20T00:00:00Z'
      })
      .eq('id', (await supabase
        .from('stories')
        .select('article_id')
        .eq('id', '873613ad-150b-44ab-846f-31e1d69a35fa')
        .single()
      ).data?.article_id)
      .select('id, title, published_at');

    if (updateError) {
      console.error('Error updating article:', updateError);
      throw new Error(`Failed to update article: ${updateError.message}`);
    }

    console.log('✅ Updated article date:', updatedArticle);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Fixed future-dated article',
        article: updatedArticle
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fix-future-dated-article function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
