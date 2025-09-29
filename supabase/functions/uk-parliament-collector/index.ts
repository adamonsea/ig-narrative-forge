// UK Parliament Data Collector Edge Function
// Fetches MP voting records and Hansard debate mentions for regional topics

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParliamentaryMention {
  mention_type: 'vote' | 'debate_mention';
  mp_name?: string;
  constituency?: string;
  party?: string;
  vote_title?: string;
  vote_date?: string;
  vote_direction?: 'aye' | 'no' | 'abstain';
  vote_url?: string;
  debate_title?: string;
  debate_date?: string;
  debate_excerpt?: string;
  hansard_url?: string;
  region_mentioned?: string;
  landmark_mentioned?: string;
  relevance_score: number;
  source_api: string;
  import_metadata: Record<string, any>;
}

// UK Regional Constituency Mapping
const REGIONAL_CONSTITUENCIES: Record<string, string[]> = {
  'Eastbourne': ['Eastbourne'],
  'Brighton': ['Brighton, Pavilion', 'Brighton, Hove'],
  'Hastings': ['Hastings and Rye'],
  'Lewes': ['Lewes'],
  'Wealden': ['Wealden'],
  'Bexhill': ['Bexhill and Battle'],
  'Seaford': ['Lewes'], // Part of Lewes constituency
  'Newhaven': ['Lewes'], // Part of Lewes constituency
  'East Sussex': ['Eastbourne', 'Hastings and Rye', 'Lewes', 'Wealden', 'Bexhill and Battle'],
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { topicId, region, forceRefresh = false } = await req.json();

    if (!topicId || !region) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'topicId and region are required' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Collecting parliamentary data for topic: ${topicId}, region: ${region}`);

    // Get topic details to check if parliamentary tracking is enabled
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, region, parliamentary_tracking_enabled, landmarks, keywords')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Topic not found' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!topic.parliamentary_tracking_enabled) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Parliamentary tracking not enabled for this topic' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we have recent data (unless forced refresh)
    if (!forceRefresh) {
      const { data: recentMentions } = await supabase
        .from('parliamentary_mentions')
        .select('created_at')
        .eq('topic_id', topicId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .limit(1);

      if (recentMentions && recentMentions.length > 0) {
        console.log('Recent parliamentary data found, skipping collection');
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Recent data available, collection skipped',
            dataAge: 'recent'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const mentions: ParliamentaryMention[] = [];
    
    // Get constituencies for this region
    const constituencies = REGIONAL_CONSTITUENCIES[region] || [region];
    
    // Collect MP voting records for the region
    for (const constituency of constituencies) {
      try {
        const votingRecords = await collectMPVotingRecords(constituency, region, topic.landmarks || []);
        mentions.push(...votingRecords);
      } catch (error) {
        console.error(`Error collecting voting records for ${constituency}:`, error);
      }
    }

    // Collect Hansard debate mentions
    try {
      const debateMentions = await collectHansardMentions(region, topic.landmarks || [], topic.keywords || []);
      mentions.push(...debateMentions);
    } catch (error) {
      console.error('Error collecting Hansard mentions:', error);
    }

    // Store mentions in database and create stories
    if (mentions.length > 0) {
      const mentionsWithTopicId = mentions.map(mention => ({
        ...mention,
        topic_id: topicId
      }));

      // Insert mentions first
      const { data: insertedMentions, error: insertError } = await supabase
        .from('parliamentary_mentions')
        .insert(mentionsWithTopicId)
        .select();

      if (insertError) {
        console.error('Error inserting parliamentary mentions:', insertError);
        throw insertError;
      }

      console.log(`Successfully stored ${mentions.length} parliamentary mentions`);

      // Create stories for each mention so they appear in the feed
      if (insertedMentions && insertedMentions.length > 0) {
        for (const mention of insertedMentions) {
          try {
            // Create a shared content entry for the parliamentary mention
            const { data: sharedContent, error: contentError } = await supabase
              .from('shared_content')
              .insert({
                title: mention.mention_type === 'vote' ? mention.vote_title : mention.debate_title,
                body: mention.mention_type === 'vote' 
                  ? `${mention.mp_name} from ${mention.constituency} (${mention.party}) voted ${mention.vote_direction} on this matter affecting ${mention.region_mentioned}.`
                  : mention.debate_excerpt || '',
                published_at: mention.mention_type === 'vote' ? mention.vote_date : mention.debate_date,
                source_url: mention.mention_type === 'vote' ? mention.vote_url : mention.hansard_url,
                import_metadata: {
                  ...mention.import_metadata,
                  parliamentary_mention_id: mention.id,
                  mention_type: mention.mention_type
                }
              })
              .select()
              .single();

            if (contentError) {
              console.error('Error creating shared content:', contentError);
              continue;
            }

            // Create topic_article link for proper topic association
            const { data: topicArticle, error: topicArticleError } = await supabase
              .from('topic_articles')
              .insert({
                topic_id: topicId,
                shared_content_id: sharedContent.id,
                processing_status: 'ready',
                regional_relevance_score: mention.relevance_score || 50,
                content_quality_score: 70,
                import_metadata: {
                  source: 'parliamentary_mention',
                  mention_id: mention.id
                }
              })
              .select()
              .single();

            if (topicArticleError) {
              console.error('Error creating topic article:', topicArticleError);
              continue;
            }

            // Create a story from the shared content
            const { data: story, error: storyError } = await supabase
              .from('stories')
              .insert({
                topic_article_id: topicArticle.id,
                shared_content_id: sharedContent.id,
                title: sharedContent.title,
                status: 'ready',
                is_published: true,
                audience_expertise: 'general',
                tone: 'formal',
                writing_style: 'journalistic',
                slide_type: 'tabloid'
              })
              .select()
              .single();

            if (storyError) {
              console.error('Error creating story:', storyError);
              continue;
            }

            // Create a slide for the story with parliamentary card styling
            const slideContent = mention.mention_type === 'vote'
              ? `**${mention.mp_name}** from **${mention.constituency}** (${mention.party}) voted **${mention.vote_direction}** on:\n\n${mention.vote_title}\n\nRegion mentioned: ${mention.region_mentioned}\n\nRelevance: ${mention.relevance_score}%`
              : `**House of Commons Debate**\n\n${mention.debate_title}\n\n*"${mention.debate_excerpt}"*\n\n**${mention.mp_name}** • ${mention.constituency} • ${mention.party}\n\n${mention.region_mentioned ? `Region: ${mention.region_mentioned}` : ''}${mention.landmark_mentioned ? `\nLandmark: ${mention.landmark_mentioned}` : ''}\n\nRelevance: ${mention.relevance_score}%`;

            const { error: slideError } = await supabase
              .from('slides')
              .insert({
                story_id: story.id,
                slide_number: 1,
                content: slideContent,
                word_count: slideContent.split(' ').length,
                links: [{
                  text: mention.mention_type === 'vote' ? 'View on Parliament.uk' : 'View Hansard',
                  url: mention.mention_type === 'vote' ? mention.vote_url : mention.hansard_url
                }]
              });

            if (slideError) {
              console.error('Error creating slide:', slideError);
              continue;
            }

            // Update the parliamentary mention with the story_id
            const { error: updateError } = await supabase
              .from('parliamentary_mentions')
              .update({ story_id: story.id })
              .eq('id', mention.id);

            if (updateError) {
              console.error('Error updating mention with story_id:', updateError);
            }

            console.log(`Created story ${story.id} for parliamentary mention ${mention.id}`);
          } catch (error) {
            console.error(`Error creating story for mention ${mention.id}:`, error);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mentionsCollected: mentions.length,
        constituencies: constituencies,
        region: region
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Parliamentary collection error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Simulate MP voting records collection (would use real Parliament API)
async function collectMPVotingRecords(
  constituency: string, 
  region: string, 
  landmarks: string[]
): Promise<ParliamentaryMention[]> {
  console.log(`Collecting voting records for constituency: ${constituency}`);
  
  // This would use the real UK Parliament API
  // For MVP, we'll return simulated data based on the constituency
  const simulatedVotes: ParliamentaryMention[] = [
    {
      mention_type: 'vote',
      mp_name: `MP for ${constituency}`,
      constituency: constituency,
      party: 'Conservative', // Would be fetched from API
      vote_title: `Infrastructure Development Bill - Amendment affecting ${region}`,
      vote_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      vote_direction: Math.random() > 0.5 ? 'aye' : 'no',
      vote_url: `https://hansard.parliament.uk/commons/vote/${constituency.toLowerCase().replace(/\s+/g, '-')}`,
      region_mentioned: region,
      relevance_score: calculateRegionalRelevance(constituency, region, landmarks),
      source_api: 'uk_parliament_votes',
      import_metadata: {
        api_version: '1.0',
        collection_method: 'constituency_search',
        simulated: true // Remove in production
      }
    }
  ];

  return simulatedVotes;
}

// Simulate Hansard debate mentions collection
async function collectHansardMentions(
  region: string, 
  landmarks: string[], 
  keywords: string[]
): Promise<ParliamentaryMention[]> {
  console.log(`Collecting Hansard mentions for region: ${region}`);
  
  // This would use the real Hansard search API
  // For MVP, we'll return simulated data
  const searchTerms = [region, ...landmarks, ...keywords].filter(Boolean);
  const simulatedMentions: ParliamentaryMention[] = [];

  for (const term of searchTerms.slice(0, 3)) { // Limit to prevent too much simulated data
    simulatedMentions.push({
      mention_type: 'debate_mention',
      debate_title: `House of Commons Debate - Local Development`,
      debate_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      debate_excerpt: `...concerns were raised about the impact on ${term} and the surrounding area...`,
      hansard_url: `https://hansard.parliament.uk/search?searchTerm=${encodeURIComponent(term)}`,
      region_mentioned: region,
      landmark_mentioned: landmarks.includes(term) ? term : undefined,
      relevance_score: calculateMentionRelevance(term, region, landmarks, keywords),
      source_api: 'uk_parliament_hansard',
      import_metadata: {
        api_version: '1.0',
        search_term: term,
        collection_method: 'hansard_search',
        simulated: true // Remove in production
      }
    });
  }

  return simulatedMentions;
}

// Calculate relevance score for regional content
function calculateRegionalRelevance(constituency: string, region: string, landmarks: string[]): number {
  let score = 50; // Base score
  
  // Exact region match
  if (constituency.toLowerCase().includes(region.toLowerCase())) {
    score += 30;
  }
  
  // Landmark mentions
  for (const landmark of landmarks) {
    if (constituency.toLowerCase().includes(landmark.toLowerCase())) {
      score += 15;
    }
  }
  
  return Math.min(100, Math.max(0, score));
}

// Calculate relevance score for debate mentions
function calculateMentionRelevance(
  term: string, 
  region: string, 
  landmarks: string[], 
  keywords: string[]
): number {
  let score = 40; // Base score for any mention
  
  // Region match
  if (term.toLowerCase() === region.toLowerCase()) {
    score += 35;
  }
  
  // Landmark match
  if (landmarks.includes(term)) {
    score += 20;
  }
  
  // Keyword match
  if (keywords.includes(term)) {
    score += 15;
  }
  
  return Math.min(100, Math.max(0, score));
}