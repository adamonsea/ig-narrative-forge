import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

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

    console.log('🕐 Starting scheduled insight card generation...');

    // Get all active, public topics
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, slug')
      .eq('is_active', true)
      .eq('is_public', true);

    if (topicsError) {
      throw new Error(`Failed to fetch topics: ${topicsError.message}`);
    }

    console.log(`  Found ${topics?.length || 0} active topics`);

    const results = [];
    
    // Generate story momentum cards for each topic
    for (const topic of topics || []) {
      try {
        console.log(`  📊 Generating cards for: ${topic.name}`);
        
        const { data, error } = await supabase.functions.invoke('generate-story-momentum-cards', {
          body: { topicId: topic.id }
        });

        if (error) {
          console.error(`    ❌ Error for ${topic.name}: ${error.message}`);
          results.push({
            topic: topic.name,
            success: false,
            error: error.message
          });
        } else {
          console.log(`    ✅ ${topic.name}: ${data.message || 'Card generated'}`);
          results.push({
            topic: topic.name,
            success: true,
            cardsGenerated: data.cardsGenerated || 0
          });
        }
      } catch (err) {
        console.error(`    ❌ Exception for ${topic.name}: ${err.message}`);
        results.push({
          topic: topic.name,
          success: false,
          error: err.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCards = results.reduce((sum, r) => sum + (r.cardsGenerated || 0), 0);

    console.log(`✅ Completed: ${successCount}/${topics?.length || 0} topics, ${totalCards} cards generated`);

    return new Response(
      JSON.stringify({ 
        success: true,
        topicsProcessed: topics?.length || 0,
        successfulTopics: successCount,
        totalCardsGenerated: totalCards,
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Scheduler error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
