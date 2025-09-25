import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧹 Starting emergency keyword cleanup...');

    // Get all topics with problematic keywords
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, keywords, topic_type');

    if (topicsError) {
      throw new Error(`Failed to fetch topics: ${topicsError.message}`);
    }

    let totalFixed = 0;
    const cleanupResults: any[] = [];

    for (const topic of topics || []) {
      if (!topic.keywords || topic.keywords.length === 0) continue;

      // EMERGENCY FIX: Remove problematic short keywords and common false positives
      const originalKeywords = topic.keywords;
      const cleanedKeywords = originalKeywords.filter((keyword: string) => {
        const trimmed = keyword.trim().toLowerCase();
        
        // Remove keywords that are too short (3 chars or less)
        if (trimmed.length <= 3) {
          console.log(`🗑️ Removing short keyword "${keyword}" from topic "${topic.name}"`);
          return false;
        }
        
        // Remove known problematic keywords that cause false positives
        const problematicKeywords = [
          'gi', 'ug', 'ugi', 'ui', 'ig', 'ag', 'ga',
          'ai', 'an', 'ag', 'is', 'it', 'in', 'on', 'at'
        ];
        
        if (problematicKeywords.includes(trimmed)) {
          console.log(`🗑️ Removing problematic keyword "${keyword}" from topic "${topic.name}"`);
          return false;
        }
        
        return true;
      });

      // Update topic if keywords were cleaned
      if (cleanedKeywords.length !== originalKeywords.length) {
        const { error: updateError } = await supabase
          .from('topics')
          .update({ 
            keywords: cleanedKeywords,
            updated_at: new Date().toISOString()
          })
          .eq('id', topic.id);

        if (updateError) {
          console.error(`❌ Failed to update topic ${topic.name}:`, updateError.message);
          continue;
        }

        const removedCount = originalKeywords.length - cleanedKeywords.length;
        totalFixed += removedCount;
        
        cleanupResults.push({
          topic_id: topic.id,
          topic_name: topic.name,
          topic_type: topic.topic_type,
          original_count: originalKeywords.length,
          cleaned_count: cleanedKeywords.length,
          removed_keywords: originalKeywords.filter((k: string) => !cleanedKeywords.includes(k)),
          removed_count: removedCount
        });

        console.log(`✅ Cleaned ${removedCount} keywords from topic "${topic.name}" (${originalKeywords.length} → ${cleanedKeywords.length})`);
      }
    }

    // Log the cleanup results
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Emergency keyword cleanup completed',
        function_name: 'fix-topic-keywords',
        context: {
          total_topics_processed: topics?.length || 0,
          total_keywords_removed: totalFixed,
          cleanup_details: cleanupResults,
          timestamp: new Date().toISOString()
        }
      });

    console.log(`🎉 Emergency keyword cleanup completed! Removed ${totalFixed} problematic keywords from ${cleanupResults.length} topics.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Emergency keyword cleanup completed',
      total_keywords_removed: totalFixed,
      topics_updated: cleanupResults.length,
      details: cleanupResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Emergency keyword cleanup error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: 'Emergency keyword cleanup failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});