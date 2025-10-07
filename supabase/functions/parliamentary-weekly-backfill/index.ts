import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

    const { topicId, region } = await req.json();

    if (!topicId || !region) {
      return new Response(
        JSON.stringify({ error: 'Missing topicId or region' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating weekly backfill roundup for topic ${topicId}, region ${region}`);

    // Get last week's date range (7 days ago to today)
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const weekStartDate = sevenDaysAgo.toISOString().split('T')[0];

    // Fetch all votes from the last 7 days that haven't been rounded up
    const { data: votesData, error: votesError } = await supabase
      .from('parliamentary_mentions')
      .select('*')
      .eq('topic_id', topicId)
      .eq('mention_type', 'vote')
      .eq('is_weekly_roundup', false)
      .gte('vote_date', weekStartDate)
      .order('vote_date', { ascending: false });

    if (votesError) {
      console.error('Error fetching votes:', votesError);
      throw votesError;
    }

    if (!votesData || votesData.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No votes to backfill',
          votesProcessed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${votesData.length} votes to include in backfill roundup`);

    // Create shared article content for the weekly roundup
    const roundupTitle = `Your MPs' Voting Week: ${new Date(weekStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    
    const { data: sharedContent, error: contentError } = await supabase
      .from('shared_article_content')
      .insert({
        url: `weekly-roundup-${weekStartDate}`,
        normalized_url: `weekly-roundup-${weekStartDate}`,
        title: roundupTitle,
        body: `Weekly summary of parliamentary voting records for ${region}`,
        published_at: today.toISOString(),
        word_count: 100,
        language: 'en',
        source_domain: 'parliament.uk'
      })
      .select()
      .single();

    if (contentError) throw contentError;

    // Create topic article
    const { data: topicArticle, error: articleError } = await supabase
      .from('topic_articles')
      .insert({
        topic_id: topicId,
        shared_content_id: sharedContent.id,
        processing_status: 'processed',
        regional_relevance_score: 100,
        content_quality_score: 85
      })
      .select()
      .single();

    if (articleError) throw articleError;

    // Create story
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .insert({
        topic_article_id: topicArticle.id,
        title: roundupTitle,
        author: 'UK Parliament',
        publication_name: 'Parliament Weekly Roundup',
        is_published: true,
        status: 'ready',
        is_parliamentary: true
      })
      .select()
      .single();

    if (storyError) throw storyError;

    // Create intro slide
    await supabase.from('slides').insert({
      story_id: story.id,
      slide_number: 1,
      content: `# ${roundupTitle}\n\nYour MPs voted ${votesData.length} times this week. Here's what happened in Parliament.`
    });

    // Create slides for each vote (max 10 votes)
    const votesToShow = votesData.slice(0, 10);
    for (let i = 0; i < votesToShow.length; i++) {
      const vote = votesToShow[i];
      const slideNumber = i + 2;

      const rebellionBadge = vote.is_rebellion ? '🔴 **Rebellion** ' : '';
      const voteIcon = vote.vote_direction === 'aye' ? '✅' : vote.vote_direction === 'no' ? '❌' : '⚪';
      
      await supabase.from('slides').insert({
        story_id: story.id,
        slide_number: slideNumber,
        content: `## ${voteIcon} ${vote.vote_title}\n\n${rebellionBadge}**${vote.mp_name}** (${vote.party}) voted **${vote.vote_direction?.toUpperCase()}**\n\n${vote.local_impact_summary || ''}\n\n📅 ${new Date(vote.vote_date).toLocaleDateString('en-GB')}\n🏛️ [View vote details](${vote.vote_url || '#'})`
      });

      // Update the vote record to mark as included in roundup
      await supabase
        .from('parliamentary_mentions')
        .update({
          is_weekly_roundup: true,
          week_start_date: weekStartDate,
          story_id: story.id
        })
        .eq('id', vote.id);
    }

    // Create outro slide
    await supabase.from('slides').insert({
      story_id: story.id,
      slide_number: votesToShow.length + 2,
      content: `## That's your parliamentary week\n\nStay informed about how your MPs represent ${region} in Westminster.\n\n💙 Share this update\n📰 Read more at [UK Parliament](https://www.parliament.uk)`
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Weekly backfill roundup created',
        votesProcessed: votesData.length,
        storyId: story.id,
        weekStartDate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating weekly backfill:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
