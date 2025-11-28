import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Topic {
  id: string;
  name: string;
  automated_insights_enabled: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔄 Insight Card Scheduler: Starting run...');

    // Clean up expired cards first
    const { error: cleanupError } = await supabase
      .from('automated_insight_cards')
      .delete()
      .lt('valid_until', new Date().toISOString());

    if (cleanupError) {
      console.error('Error cleaning up expired cards:', cleanupError);
    } else {
      console.log('✅ Cleaned up expired insight cards');
    }

    // Get all topics with insights enabled
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, automated_insights_enabled')
      .eq('is_active', true)
      .eq('automated_insights_enabled', true);

    if (topicsError) {
      throw new Error(`Failed to fetch topics: ${topicsError.message}`);
    }

    console.log(`📊 Found ${topics?.length || 0} topics with insights enabled`);

    const results = [];

    // For each topic, check if we need to generate cards
    for (const topic of topics || []) {
      console.log(`\n🎯 Processing topic: ${topic.name}`);

      // Fetch insight settings for this topic
      const { data: settings, error: settingsError } = await supabase
        .from('topic_insight_settings')
        .select('*')
        .eq('topic_id', topic.id)
        .single();

      if (settingsError) {
        console.error(`  ❌ Failed to fetch insight settings: ${settingsError.message}`);
        continue;
      }

      // Check existing active cards for this topic
      const { data: existingCards, error: cardsError } = await supabase
        .from('automated_insight_cards')
        .select('card_type, valid_until')
        .eq('topic_id', topic.id)
        .eq('is_published', true)
        .gt('valid_until', new Date().toISOString());

      if (cardsError) {
        console.error(`Error fetching cards for ${topic.name}:`, cardsError);
        continue;
      }

      const cardTypes = new Set(existingCards?.map(c => c.card_type) || []);
      console.log(`  Existing card types: ${Array.from(cardTypes).join(', ') || 'none'}`);
      console.log(`  Settings: momentum=${settings.story_momentum_enabled}, social=${settings.social_proof_enabled}, flashback=${settings.this_time_last_month_enabled}`);

      // Generate Story Momentum cards if enabled AND missing (daily refresh)
      if (settings.story_momentum_enabled && !cardTypes.has('story_momentum')) {
        console.log(`  📈 Triggering story momentum card generation...`);
        const { error: momentumError } = await supabase.functions.invoke('generate-story-momentum-cards', {
          body: { topicId: topic.id }
        });

        if (momentumError) {
          console.error(`  ❌ Failed to generate momentum card: ${momentumError.message}`);
          results.push({ topic: topic.name, type: 'momentum', success: false, error: momentumError.message });
        } else {
          console.log(`  ✅ Momentum card generated`);
          results.push({ topic: topic.name, type: 'momentum', success: true });
        }
      }

      // Social proof cards (weekly refresh) - only if enabled
      if (settings.social_proof_enabled && !cardTypes.has('social_proof')) {
        console.log(`  👥 Triggering social proof card generation...`);
        const { error: socialError } = await supabase.functions.invoke('generate-social-proof-cards', {
          body: { topicId: topic.id }
        });

        if (socialError) {
          console.error(`  ❌ Failed to generate social proof card: ${socialError.message}`);
          results.push({ topic: topic.name, type: 'social_proof', success: false, error: socialError.message });
        } else {
          console.log(`  ✅ Social proof card generated`);
          results.push({ topic: topic.name, type: 'social_proof', success: true });
        }
      }

      // "This time last month" cards (monthly refresh) - only if enabled
      if (settings.this_time_last_month_enabled && !cardTypes.has('this_time_last_month')) {
        console.log(`  📅 Triggering flashback card generation...`);
        console.log(`  ⏭️ Flashback generator not yet implemented`);
        // TODO: Implement generate-flashback-cards function
      }

      // Quiz Cards - generate new quizzes from today's stories if enabled
      if (settings.quiz_cards_enabled) {
        console.log(`  🧠 Triggering quiz question generation...`);
        const { error: quizError } = await supabase.functions.invoke('generate-quiz-questions', {
          body: { topicId: topic.id }
        });

        if (quizError) {
          console.error(`  ❌ Failed to generate quiz questions: ${quizError.message}`);
          results.push({ topic: topic.name, type: 'quiz', success: false, error: quizError.message });
        } else {
          console.log(`  ✅ Quiz questions generated`);
          results.push({ topic: topic.name, type: 'quiz', success: true });
        }
      }
    }

    console.log('\n✅ Insight Card Scheduler: Complete');

    return new Response(
      JSON.stringify({
        success: true,
        topics_processed: topics?.length || 0,
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
