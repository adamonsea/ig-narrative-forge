import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !lovableApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { voteId, batchMode = false } = await req.json();

    console.log(`🤖 Generating vote context ${batchMode ? '(batch mode)' : ''}`);

    let votesToProcess: any[] = [];

    if (batchMode) {
      // Process votes without context
      const { data, error } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .is('vote_context', null)
        .limit(10); // Process 10 at a time to avoid rate limits

      if (error) throw error;
      votesToProcess = data || [];
      console.log(`📋 Found ${votesToProcess.length} votes to process`);
    } else if (voteId) {
      const { data, error } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('id', voteId)
        .single();

      if (error) throw error;
      votesToProcess = [data];
    } else {
      throw new Error('Either voteId or batchMode must be provided');
    }

    let successCount = 0;
    let errorCount = 0;

    for (const vote of votesToProcess) {
      try {
        const billDescription = vote.import_metadata?.bill_description || '';
        const billStage = vote.import_metadata?.bill_stage || 'Main Chamber';

        // Generate AI context using DeepSeek
        const prompt = `You are a UK political analyst explaining parliamentary votes to local residents.

Vote Title: ${vote.vote_title}
Category: ${vote.vote_category}
Bill Stage: ${billStage}
${billDescription ? `Description: ${billDescription}` : ''}
Outcome: ${vote.vote_outcome} (${vote.aye_count} Ayes, ${vote.no_count} Noes)

Generate:
1. One-sentence summary (max 120 chars): What this vote was about
2. Why it matters (2-3 sentences): Local impact in plain English
3. Key context (1 sentence): What happens next or why MPs debated this

Write for general audience. No jargon. Be accurate but concise.

Format your response exactly as:
SUMMARY: [your one-sentence summary]
IMPACT: [your 2-3 sentence impact explanation]
CONTEXT: [your one-sentence context]`;

        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            messages: [
              { role: 'system', content: 'You are a helpful UK political analyst. Always format responses exactly as requested.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 500,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ AI API error for vote ${vote.id}:`, response.status, errorText);
          errorCount++;
          continue;
        }

        const aiData = await response.json();
        const generatedText = aiData.choices?.[0]?.message?.content || '';

        if (!generatedText) {
          console.error(`❌ Empty AI response for vote ${vote.id}`);
          errorCount++;
          continue;
        }

        // Parse the AI response
        const summaryMatch = generatedText.match(/SUMMARY:\s*(.+?)(?=\n|$)/i);
        const impactMatch = generatedText.match(/IMPACT:\s*(.+?)(?=CONTEXT:|$)/is);
        const contextMatch = generatedText.match(/CONTEXT:\s*(.+?)$/is);

        const voteContext = summaryMatch?.[1]?.trim() || generatedText.split('\n')[0];
        const enhancedImpact = impactMatch?.[1]?.trim() || '';
        const keyContext = contextMatch?.[1]?.trim() || '';

        // Combine impact text
        const fullImpactSummary = enhancedImpact 
          ? `${enhancedImpact}${keyContext ? ' ' + keyContext : ''}`
          : vote.local_impact_summary;

        // Update the vote record
        const { error: updateError } = await supabase
          .from('parliamentary_mentions')
          .update({
            vote_context: voteContext,
            local_impact_summary: fullImpactSummary,
            bill_description: billDescription || null,
            bill_stage: billStage || null,
          })
          .eq('id', vote.id);

        if (updateError) {
          console.error(`❌ Error updating vote ${vote.id}:`, updateError);
          errorCount++;
        } else {
          console.log(`✅ Generated context for: ${vote.vote_title.substring(0, 60)}...`);
          successCount++;
        }

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error processing vote ${vote.id}:`, error);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: votesToProcess.length,
        successCount,
        errorCount,
        message: `Generated context for ${successCount} votes`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Vote context generation error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});