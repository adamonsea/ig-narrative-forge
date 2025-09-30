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

    // Check if we have mentions without stories and backfill them
    const { data: mentionsWithoutStories } = await supabase
      .from('parliamentary_mentions')
      .select('*')
      .eq('topic_id', topicId)
      .is('story_id', null);

    if (mentionsWithoutStories && mentionsWithoutStories.length > 0) {
      console.log(`Found ${mentionsWithoutStories.length} parliamentary mentions without stories, creating them now`);
      await createStoriesForMentions(supabase, mentionsWithoutStories, topicId);
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
            dataAge: 'recent',
            backfilledStories: mentionsWithoutStories?.length || 0
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
            // Build comprehensive body content from import_metadata
            const bodyContent = mention.import_metadata?.comprehensive_content === true
              ? buildComprehensiveContent(mention)
              : (mention.mention_type === 'vote' 
                  ? `${mention.mp_name} from ${mention.constituency} (${mention.party}) voted ${mention.vote_direction} on this matter affecting ${mention.region_mentioned}.`
                  : mention.debate_excerpt || '');
            
            // Create a shared content entry for the parliamentary mention
            const { data: sharedContent, error: contentError } = await supabase
              .from('shared_article_content')
              .insert({
                title: mention.mention_type === 'vote' ? mention.vote_title : mention.debate_title,
                body: bodyContent,
                published_at: mention.mention_type === 'vote' ? mention.vote_date : mention.debate_date,
                source_url: mention.mention_type === 'vote' ? mention.vote_url : mention.hansard_url,
                word_count: mention.import_metadata?.word_count || bodyContent.split(/\s+/).length,
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

// Collect MP voting records using UK Parliament API
async function collectMPVotingRecords(
  constituency: string, 
  region: string, 
  landmarks: string[]
): Promise<ParliamentaryMention[]> {
  console.log(`Collecting voting records for constituency: ${constituency}`);
  
  const mentions: ParliamentaryMention[] = [];
  
  try {
    // First, get the MP for this constituency using Members API
    // Search by constituency name in the membershipFromMemberId field
    const membersResponse = await fetch(
      `https://members-api.parliament.uk/api/Members/Search?House=1&IsCurrentMember=true&skip=0&take=100`
    );
    
    if (!membersResponse.ok) {
      console.error('Failed to fetch members:', membersResponse.status);
      return mentions;
    }
    
    const membersData = await membersResponse.json();
    
    // Search through all members to find the one representing this constituency
    const mp = membersData.items?.find((m: any) => {
      const membershipFrom = m.value?.latestHouseMembership?.membershipFromMemberName || '';
      return membershipFrom.toLowerCase().includes(constituency.toLowerCase()) ||
             constituency.toLowerCase().includes(membershipFrom.toLowerCase());
    });
    
    if (!mp) {
      console.log(`No current MP found for constituency: ${constituency}`);
      console.log('Available constituencies:', membersData.items?.slice(0, 5).map((m: any) => 
        m.value?.latestHouseMembership?.membershipFromMemberName
      ));
      return mentions;
    }
    
    const mpId = mp.value.id;
    const mpName = mp.value.nameDisplayAs;
    const party = mp.value.latestParty?.name;
    
    console.log(`Found MP: ${mpName} (${party}) for ${constituency}`);
    
    // Get recent divisions this MP voted in
    const divisionsResponse = await fetch(
      `https://commonsvotes-api.parliament.uk/data/divisions.json/search?queryParameters.memberId=${mpId}&queryParameters.take=5`
    );
    
    if (!divisionsResponse.ok) {
      console.error('Failed to fetch divisions:', divisionsResponse.status);
      return mentions;
    }
    
    const divisionsData = await divisionsResponse.json();
    
    for (const division of divisionsData || []) {
      // Check if division is relevant to region/landmarks
      const title = division.Title || '';
      const isRelevant = title.toLowerCase().includes(region.toLowerCase()) ||
                        landmarks.some(l => title.toLowerCase().includes(l.toLowerCase()));
      
      if (!isRelevant) continue;
      
      // Get detailed division info
      const detailResponse = await fetch(
        `https://commonsvotes-api.parliament.uk/data/division/${division.DivisionId}.json`
      );
      
      if (!detailResponse.ok) continue;
      
      const detailData = await detailResponse.json();
      
      // Find how this MP voted
      const ayeVote = detailData.Ayes?.find((v: any) => v.MemberId === mpId);
      const noVote = detailData.Noes?.find((v: any) => v.MemberId === mpId);
      const voteDirection = ayeVote ? 'aye' : noVote ? 'no' : 'abstain';
      
      // Build comprehensive content (200-300 words)
      const voteDate = new Date(division.Date).toISOString().split('T')[0];
      const ayeCount = detailData.AyeCount || 0;
      const noCount = detailData.NoCount || 0;
      const outcome = ayeCount > noCount ? 'passed' : 'rejected';
      
      const comprehensiveBody = `
**Parliamentary Division: ${title}**

On ${new Date(division.Date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, the House of Commons voted on ${title.toLowerCase()}, a matter with direct implications for ${region} and the surrounding constituency.

**The Vote:**
${mpName}, Member of Parliament for ${constituency} (${party}), voted **${voteDirection.toUpperCase()}** on this division. The final count was ${ayeCount} Ayes to ${noCount} Noes, resulting in the motion being ${outcome}.

**Regional Impact:**
This parliamentary decision affects ${region} as ${title.toLowerCase().includes('infrastructure') ? 'it concerns local infrastructure development and planning' : title.toLowerCase().includes('funding') ? 'it relates to funding allocation for local services' : title.toLowerCase().includes('transport') ? 'it impacts local transport and connectivity' : 'it has significant implications for the local community'}.

${landmarks.length > 0 ? `Areas of particular concern include ${landmarks.slice(0, 2).join(' and ')}, where residents and businesses will see the effects of this parliamentary action.` : ''}

**Your MP's Position:**
${mpName}'s ${voteDirection} vote represents their stance on this matter affecting their constituents in ${constituency}. This vote was recorded in the official House of Commons division record and forms part of the parliamentary record.

For full debate context and the complete division list, see the official Hansard record and Commons Voting Records.
`.trim();
      
      mentions.push({
        mention_type: 'vote',
        mp_name: mpName,
        constituency: constituency,
        party: party,
        vote_title: title,
        vote_date: voteDate,
        vote_direction: voteDirection as 'aye' | 'no' | 'abstain',
        vote_url: `https://commonsvotes.digiminster.com/Divisions/Details/${division.DivisionId}`,
        region_mentioned: region,
        relevance_score: calculateRegionalRelevance(constituency, region, landmarks),
        source_api: 'uk_parliament_commons_votes',
        import_metadata: {
          api_version: '1.0',
          collection_method: 'mp_voting_records',
          division_id: division.DivisionId,
          mp_id: mpId,
          vote_counts: { ayes: ayeCount, noes: noCount },
          outcome: outcome,
          comprehensive_content: true,
          word_count: comprehensiveBody.split(/\s+/).length
        }
      });
    }
    
    console.log(`Collected ${mentions.length} voting records for ${constituency}`);
    
  } catch (error) {
    console.error('Error collecting MP voting records:', error);
  }
  
  return mentions;
}

// Collect Hansard debate mentions using UK Parliament API
async function collectHansardMentions(
  region: string, 
  landmarks: string[], 
  keywords: string[]
): Promise<ParliamentaryMention[]> {
  console.log(`Collecting Hansard mentions for region: ${region}`);
  
  const mentions: ParliamentaryMention[] = [];
  const searchTerms = [region, ...landmarks].filter(Boolean).slice(0, 3); // Limit searches
  
  try {
    for (const searchTerm of searchTerms) {
      // Use Parliament's Search API (which powers hansard.parliament.uk)
      // Search back 12 months to find mentions
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);
      
      const searchResponse = await fetch(
        `https://search-material.parliament.uk/search?q=${encodeURIComponent(searchTerm)}&house=commons&type=debates&start-date=${startDate.toISOString().split('T')[0]}&rows=5`
      );
      
      if (!searchResponse.ok) {
        console.error(`Failed to search Parliament for "${searchTerm}":`, searchResponse.status, await searchResponse.text());
        continue;
      }
      
      const searchData = await searchResponse.json();
      
      for (const result of searchData.response?.docs || []) {
        try {
          // Extract relevant fields from Parliament Search API response
          const title = result.title || result.summary || `Parliamentary Debate mentioning ${searchTerm}`;
          const snippet = result.content || result.summary || '';
          const debateUrl = result.url || `https://hansard.parliament.uk/search?searchTerm=${encodeURIComponent(searchTerm)}`;
          const date = result.date || new Date().toISOString().split('T')[0];
          
          // Extract speaker information if available
          const speakerMatch = snippet.match(/(\w+\s+\w+)\s*\(([^)]+)\)/);
          const speakerName = speakerMatch?.[1] || result.member_name || 'Member of Parliament';
          const speakerConstituency = speakerMatch?.[2] || result.constituency_name || '';
          
          // Clean and extract meaningful content (aim for 300-500 words)
          const textContent = snippet
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (textContent.length < 50) {
            console.log(`Skipping result with insufficient content: ${title}`);
            continue;
          }
          
          const debateDate = new Date(date).toISOString().split('T')[0];
          
          const comprehensiveBody = `
**House of Commons Debate - ${title}**

**Date:** ${new Date(debateDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

**Context:**
During parliamentary proceedings, ${region} was specifically mentioned in debates concerning ${title.toLowerCase()}. This parliamentary discussion provides important insight into how regional concerns are being addressed at the national level.

**Parliamentary Record:**
"${textContent.substring(0, 400)}${textContent.length > 400 ? '...' : ''}"

**Significance for ${region}:**
This mention in the House of Commons demonstrates that ${region}'s concerns are being raised at the highest level of government. ${landmarks.length > 0 ? `Specific references to ${landmarks[0]} indicate that local landmarks and infrastructure are part of the parliamentary conversation.` : 'The discussion encompasses matters directly affecting local residents and businesses.'}

**Speaker:**
${speakerName}${speakerConstituency ? ` representing ${speakerConstituency}` : ''} raised these points during the debate, ensuring that ${region}'s interests are represented in parliamentary discourse.

**Parliamentary Procedure:**
These statements form part of the official Hansard record, which is the transcription of all parliamentary debates. This ensures transparency and allows constituents to see exactly what is being said about their region in Parliament.

${keywords.length > 0 ? `**Related Topics:** This debate also touched on ${keywords.slice(0, 3).join(', ')}, showing the breadth of issues affecting the region.` : ''}

**Full Record:**
The complete debate transcript, including all contributions and responses, is available in the official Hansard archive.
`.trim();
          
          mentions.push({
            mention_type: 'debate_mention',
            mp_name: speakerName,
            constituency: speakerConstituency || undefined,
            debate_title: title,
            debate_date: debateDate,
            debate_excerpt: textContent.substring(0, 200),
            hansard_url: debateUrl,
            region_mentioned: region,
            landmark_mentioned: landmarks.includes(searchTerm) ? searchTerm : undefined,
            relevance_score: calculateMentionRelevance(searchTerm, region, landmarks, keywords),
            source_api: 'uk_parliament_search',
            import_metadata: {
              api_version: '2.0',
              search_term: searchTerm,
              collection_method: 'parliament_search_api',
              debate_id: result.id,
              comprehensive_content: true,
              word_count: comprehensiveBody.split(/\s+/).length,
              context_extracted: textContent.length,
              search_result_type: result.type || 'debate'
            }
          });
          
          console.log(`✓ Found debate mention: "${title.substring(0, 50)}..." (${textContent.length} chars extracted)`);
          
        } catch (error) {
          console.error('Error processing debate result:', error);
        }
      }
    }
    
    console.log(`Collected ${mentions.length} Hansard mentions for ${region}`);
    
  } catch (error) {
    console.error('Error collecting Hansard mentions:', error);
  }
  
  return mentions;
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

// Build comprehensive content for story creation
function buildComprehensiveContent(mention: any): string {
  if (mention.mention_type === 'vote') {
    const metadata = mention.import_metadata || {};
    return `
**Parliamentary Division: ${mention.vote_title}**

On ${new Date(mention.vote_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, the House of Commons voted on ${mention.vote_title?.toLowerCase()}, a matter with direct implications for ${mention.region_mentioned} and the surrounding constituency.

**The Vote:**
${mention.mp_name}, Member of Parliament for ${mention.constituency} (${mention.party}), voted **${mention.vote_direction?.toUpperCase()}** on this division. ${metadata.vote_counts ? `The final count was ${metadata.vote_counts.ayes} Ayes to ${metadata.vote_counts.noes} Noes, resulting in the motion being ${metadata.outcome}.` : ''}

**Regional Impact:**
This parliamentary decision affects ${mention.region_mentioned} and represents important legislative action at the national level that will have local consequences.

**Your MP's Position:**
${mention.mp_name}'s ${mention.vote_direction} vote represents their stance on this matter affecting their constituents in ${mention.constituency}. This vote was recorded in the official House of Commons division record.

For full debate context and the complete division list, see the official Hansard record and Commons Voting Records.
`.trim();
  } else {
    return `
**House of Commons Debate - ${mention.debate_title}**

**Date:** ${new Date(mention.debate_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

**Context:**
During parliamentary proceedings, ${mention.region_mentioned} was specifically mentioned in debates. This parliamentary discussion provides important insight into how regional concerns are being addressed at the national level.

**Parliamentary Record:**
"${mention.debate_excerpt}"

**Significance:**
This mention in the House of Commons demonstrates that ${mention.region_mentioned}'s concerns are being raised at the highest level of government.${mention.landmark_mentioned ? ` Specific references to ${mention.landmark_mentioned} indicate that local landmarks are part of the parliamentary conversation.` : ''}

${mention.mp_name ? `**Speaker:** ${mention.mp_name}${mention.constituency ? ` representing ${mention.constituency}` : ''} raised these points during the debate.` : ''}

**Full Record:**
The complete debate transcript is available in the official Hansard archive.
`.trim();
  }
}

// Helper function to create stories for parliamentary mentions
async function createStoriesForMentions(supabase: any, mentions: any[], topicId: string) {
  for (const mention of mentions) {
    try {
      // Build comprehensive body content
      const bodyContent = mention.import_metadata?.comprehensive_content === true
        ? buildComprehensiveContent(mention)
        : (mention.mention_type === 'vote' 
            ? `${mention.mp_name} from ${mention.constituency} (${mention.party}) voted ${mention.vote_direction} on this matter affecting ${mention.region_mentioned}.`
            : mention.debate_excerpt || '');
      
      // Create a shared content entry for the parliamentary mention
      const { data: sharedContent, error: contentError } = await supabase
        .from('shared_article_content')
        .insert({
          url: mention.mention_type === 'vote' ? mention.vote_url : mention.hansard_url,
          normalized_url: (mention.mention_type === 'vote' ? mention.vote_url : mention.hansard_url)?.toLowerCase(),
          title: mention.mention_type === 'vote' ? mention.vote_title : mention.debate_title,
          body: bodyContent,
          published_at: mention.mention_type === 'vote' ? mention.vote_date : mention.debate_date,
          word_count: mention.import_metadata?.word_count || bodyContent.split(/\s+/).length,
          language: 'en'
        })
        .select()
        .single();

      if (contentError) {
        console.error('Error creating shared content for backfill:', contentError);
        continue;
      }

      // Create topic_article link for proper topic association
      const { data: topicArticle, error: topicArticleError } = await supabase
        .from('topic_articles')
        .insert({
          topic_id: topicId,
          shared_content_id: sharedContent.id,
          processing_status: 'processed',
          regional_relevance_score: mention.relevance_score || 50,
          content_quality_score: 70,
          import_metadata: {
            source: 'parliamentary_mention',
            mention_id: mention.id,
            backfilled: true
          }
        })
        .select()
        .single();

      if (topicArticleError) {
        console.error('Error creating topic article for backfill:', topicArticleError);
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
          audience_expertise: 'intermediate',
          tone: 'conversational',
          writing_style: 'journalistic',
          slide_type: 'tabloid'
        })
        .select()
        .single();

      if (storyError) {
        console.error('Error creating story for backfill:', storyError);
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
            start: 0,
            end: 0,
            text: mention.mention_type === 'vote' ? 'View on Parliament.uk' : 'View Hansard',
            url: mention.mention_type === 'vote' ? mention.vote_url : mention.hansard_url
          }]
        });

      if (slideError) {
        console.error('Error creating slide for backfill:', slideError);
        continue;
      }

      // Update the parliamentary mention with the story_id
      await supabase
        .from('parliamentary_mentions')
        .update({ story_id: story.id })
        .eq('id', mention.id);

      console.log(`Created story ${story.id} for parliamentary mention ${mention.id}`);
    } catch (error) {
      console.error(`Error creating story for mention ${mention.id}:`, error);
    }
  }
}