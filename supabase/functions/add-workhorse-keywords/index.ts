import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WORKHORSE_KEYWORDS = [
  'orthopedic implants',
  'cardiovascular devices',
  'surgical instruments',
  'diagnostic equipment',
  'prosthetic devices',
  'medical implants',
  'surgical technology',
  'patient monitoring',
  'imaging devices',
  'respiratory devices',
  'neurological devices',
  'dental devices',
  'ophthalmic devices',
  'wound care devices',
  'rehabilitation devices'
];

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

    console.log('🔧 Adding workhorse keywords to Medical Device Development topic...');

    // Find the Medical Device Development topic
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, keywords, slug')
      .eq('slug', 'medical-device-development')
      .single();

    if (topicError || !topic) {
      throw new Error(`Failed to find topic: ${topicError?.message || 'Topic not found'}`);
    }

    console.log(`📋 Current topic: ${topic.name}`);
    console.log(`📊 Current keywords count: ${topic.keywords?.length || 0}`);

    // Merge keywords, avoiding duplicates
    const existingKeywords = topic.keywords || [];
    const newKeywords = [...existingKeywords];
    let addedCount = 0;

    for (const keyword of WORKHORSE_KEYWORDS) {
      const keywordLower = keyword.toLowerCase();
      const exists = existingKeywords.some((k: string) => k.toLowerCase() === keywordLower);
      
      if (!exists) {
        newKeywords.push(keyword);
        addedCount++;
        console.log(`✅ Adding: "${keyword}"`);
      } else {
        console.log(`⏭️  Skipping (already exists): "${keyword}"`);
      }
    }

    if (addedCount === 0) {
      console.log('✨ All workhorse keywords already present!');
      return new Response(JSON.stringify({
        success: true,
        message: 'All workhorse keywords already present',
        keywords_added: 0,
        total_keywords: newKeywords.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update the topic with new keywords
    const { error: updateError } = await supabase
      .from('topics')
      .update({ 
        keywords: newKeywords,
        updated_at: new Date().toISOString()
      })
      .eq('id', topic.id);

    if (updateError) {
      throw new Error(`Failed to update topic: ${updateError.message}`);
    }

    // Log the update
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Added workhorse keywords to Medical Device Development topic',
        function_name: 'add-workhorse-keywords',
        context: {
          topic_id: topic.id,
          topic_name: topic.name,
          keywords_added: addedCount,
          previous_count: existingKeywords.length,
          new_count: newKeywords.length,
          added_keywords: WORKHORSE_KEYWORDS.filter(k => 
            !existingKeywords.some((ek: string) => ek.toLowerCase() === k.toLowerCase())
          ),
          timestamp: new Date().toISOString()
        }
      });

    console.log(`🎉 Successfully added ${addedCount} workhorse keywords!`);
    console.log(`📊 Total keywords: ${existingKeywords.length} → ${newKeywords.length}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully added ${addedCount} workhorse keywords`,
      keywords_added: addedCount,
      previous_count: existingKeywords.length,
      new_count: newKeywords.length,
      topic_name: topic.name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Error adding workhorse keywords:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: 'Failed to add workhorse keywords to Medical Device Development topic'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
