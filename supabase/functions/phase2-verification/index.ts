import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Phase 2 Verification - Multi-tenant Content Generator Health Check');

    // 1. Check database schema for audience_expertise column
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', 'stories')
      .eq('table_schema', 'public')
      .eq('column_name', 'audience_expertise');

    const hasColumn = columns && columns.length > 0;
    console.log(`✅ Database schema check: audience_expertise column ${hasColumn ? 'exists' : 'missing'}`);

    // 2. Check queue status
    const { data: queueStats, error: queueError } = await supabase
      .from('content_generation_queue')
      .select('status, COUNT(*)')
      .groupBy('status');

    console.log('📊 Queue status:', queueStats);

    // 3. Get a sample pending item with multi-tenant context
    const { data: sampleItem, error: sampleError } = await supabase
      .from('content_generation_queue')
      .select(`
        id, 
        status, 
        topic_article_id, 
        shared_content_id,
        shared_article_content:shared_content_id(title, url)
      `)
      .eq('status', 'pending')
      .not('topic_article_id', 'is', null)
      .not('shared_content_id', 'is', null)
      .limit(1)
      .single();

    const hasMultiTenantItems = sampleItem && sampleItem.topic_article_id && sampleItem.shared_content_id;
    console.log(`✅ Multi-tenant queue items: ${hasMultiTenantItems ? 'available' : 'none found'}`);

    // 4. Test enhanced-content-generator with a sample
    let generatorTest = null;
    if (hasMultiTenantItems && sampleItem) {
      console.log(`🧪 Testing content generator with item: ${sampleItem.id}`);
      
      const { data: testResult, error: testError } = await supabase.functions.invoke('enhanced-content-generator', {
        body: {
          articleId: null, // Multi-tenant mode doesn't need legacy article ID
          topicArticleId: sampleItem.topic_article_id,
          sharedContentId: sampleItem.shared_content_id,
          slideType: 'tabloid',
          aiProvider: 'deepseek',
          tone: 'conversational',
          audienceExpertise: 'intermediate'
        }
      });

      if (testError) {
        console.error('❌ Content generator test failed:', testError);
        generatorTest = { success: false, error: testError.message };
      } else {
        console.log('✅ Content generator test succeeded');
        generatorTest = { success: true, result: testResult };
        
        // Check if story was created with proper multi-tenant linkage
        const { data: createdStory, error: storyError } = await supabase
          .from('stories')
          .select('id, title, topic_article_id, shared_content_id, audience_expertise')
          .eq('topic_article_id', sampleItem.topic_article_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (createdStory) {
          console.log('✅ Story created with multi-tenant linkage:', createdStory);
          generatorTest.story = createdStory;
        }
      }
    }

    // 5. Overall health assessment
    const isHealthy = hasColumn && hasMultiTenantItems && (generatorTest?.success !== false);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        phase: 'Phase 2 - Multi-tenant Content Generator',
        status: isHealthy ? 'HEALTHY' : 'NEEDS_ATTENTION',
        checks: {
          database_schema: hasColumn,
          multi_tenant_queue_items: hasMultiTenantItems,
          content_generator_test: generatorTest
        },
        queue_stats: queueStats,
        sample_item: sampleItem,
        recommendations: isHealthy ? [
          'Pipeline is ready for processing',
          'Queue processor should work automatically',
          'Articles should flow from Arrivals → Queue → Published'
        ] : [
          'Review error logs for content generator issues',
          'Check for missing API keys (DeepSeek, OpenAI)',
          'Verify database permissions'
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Phase 2 verification failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        phase: 'Phase 2 - Verification'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});