import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
    const { articleId } = await req.json();

    console.log('Starting duplicate detection for article:', articleId);

    // Find potential duplicates using the database function
    const { data: duplicates, error: duplicateError } = await supabase
      .rpc('detect_article_duplicates', { p_article_id: articleId });

    if (duplicateError) {
      console.error('Error detecting duplicates:', duplicateError);
      throw new Error(`Duplicate detection failed: ${duplicateError.message}`);
    }

    if (!duplicates || duplicates.length === 0) {
      console.log('No duplicates found for article:', articleId);
      return new Response(
        JSON.stringify({ 
          success: true, 
          duplicatesFound: 0,
          message: 'No duplicates detected'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store duplicate detection results
    const duplicateRecords = duplicates.map((duplicate: any) => ({
      original_article_id: articleId,
      duplicate_article_id: duplicate.duplicate_id,
      similarity_score: duplicate.similarity_score,
      detection_method: duplicate.detection_method,
      status: 'pending'
    }));

    const { error: insertError } = await supabase
      .from('article_duplicates_pending')
      .insert(duplicateRecords);

    if (insertError) {
      console.error('Error storing duplicate records:', insertError);
      throw new Error(`Failed to store duplicates: ${insertError.message}`);
    }

    // Update the article status to indicate duplicate detection is complete
    const { error: updateError } = await supabase
      .from('articles')
      .update({ 
        processing_status: 'duplicate_pending',
        import_metadata: {
          duplicate_check_completed: true,
          duplicates_found: duplicates.length,
          checked_at: new Date().toISOString()
        }
      })
      .eq('id', articleId);

    if (updateError) {
      console.error('Error updating article status:', updateError);
      // Don't throw here as the main functionality worked
    }

    console.log(`Found ${duplicates.length} potential duplicates for article ${articleId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        duplicatesFound: duplicates.length,
        duplicates: duplicates.map((d: any) => ({
          articleId: d.duplicate_id,
          similarity: d.similarity_score,
          method: d.detection_method
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in duplicate-detector function:', error);
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