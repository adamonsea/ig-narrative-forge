// UK Parliament Voting Record Collector
// Fetches comprehensive MP voting records for regional topics
// Supports daily individual posts and weekly roundup posts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VotingRecord {
  mention_type: 'vote';
  mp_name: string;
  constituency: string;
  party: string;
  vote_title: string;
  vote_date: string;
  vote_direction: 'aye' | 'no' | 'abstain';
  vote_url: string;
  region_mentioned: string;
  relevance_score: number;
  source_api: string;
  // New enhanced fields
  party_whip_vote?: 'aye' | 'no' | 'free_vote';
  is_rebellion: boolean;
  vote_category: string;
  national_relevance_score: number;
  local_impact_summary: string;
  vote_outcome: 'passed' | 'rejected';
  aye_count: number;
  no_count: number;
  is_weekly_roundup?: boolean;
  week_start_date?: string;
  import_metadata: Record<string, any>;
}

type MPInfo = {
  id: number;
  name: string;
  party: string;
};

// UK Regional Constituency Mapping
const REGIONAL_CONSTITUENCIES: Record<string, string[]> = {
  'Eastbourne': ['Eastbourne'],
  'Brighton': ['Brighton, Pavilion', 'Brighton, Hove'],
  'Hastings': ['Hastings and Rye'],
  'Lewes': ['Lewes'],
  'Wealden': ['Wealden'],
  'Bexhill': ['Bexhill and Battle'],
  'Seaford': ['Lewes'],
  'Newhaven': ['Lewes'],
  'East Sussex': ['Eastbourne', 'Hastings and Rye', 'Lewes', 'Wealden', 'Bexhill and Battle'],
};

const MP_CACHE = new Map<string, MPInfo | null>();

async function fetchCurrentMpForConstituency(constituency: string): Promise<MPInfo | null> {
  const cacheKey = constituency.toLowerCase();
  if (MP_CACHE.has(cacheKey)) {
    const cached = MP_CACHE.get(cacheKey) || null;
    if (cached) {
      return cached;
    }
    return null;
  }

  const pageSize = 100;
  let skip = 0;

  while (true) {
    const searchUrl = `https://members-api.parliament.uk/api/Members/Search?House=1&IsCurrentMember=true&skip=${skip}&take=${pageSize}`;
    const membersResponse = await fetch(searchUrl);

    if (!membersResponse.ok) {
      console.error('Failed to fetch members:', membersResponse.status, membersResponse.statusText);
      break;
    }

    const membersData = await membersResponse.json();
    const items = membersData.items || [];

    const mp = items.find((m: any) => {
      const membershipFrom = m.value?.latestHouseMembership?.membershipFromMemberName || '';
      return membershipFrom.toLowerCase().includes(constituency.toLowerCase()) ||
             constituency.toLowerCase().includes(membershipFrom.toLowerCase());
    });

    if (mp) {
      const mpInfo: MPInfo = {
        id: mp.value.id,
        name: mp.value.nameDisplayAs,
        party: mp.value.latestParty?.name || 'Unknown'
      };
      MP_CACHE.set(cacheKey, mpInfo);
      return mpInfo;
    }

    const totalResults = typeof membersData.totalResults === 'number' ? membersData.totalResults : 0;
    const reachedEnd = items.length < pageSize || skip + pageSize >= totalResults;

    if (reachedEnd) {
      break;
    }

    skip += pageSize;
  }

  console.warn(`No current MP found for constituency after full search: ${constituency}`);
  MP_CACHE.set(cacheKey, null);
  return null;
}

serve(async (req) => {
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

    const { topicId, region, mode = 'daily', forceRefresh = false } = await req.json();

    if (!topicId || !region) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'topicId and region are required' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Collecting parliamentary voting records for topic: ${topicId}, region: ${region}, mode: ${mode}`);

    // Get topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, region, parliamentary_tracking_enabled')
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

    // Get constituencies for this region
    const constituencies = REGIONAL_CONSTITUENCIES[region] || [region];
    
    if (mode === 'daily') {
      // First, backfill any existing votes that don't have stories
      console.log('🔄 Checking for existing votes without stories...');
      const { data: orphanedVotes, error: orphanedError } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('topic_id', topicId)
        .is('story_id', null)
        .eq('is_weekly_roundup', false);
      
      if (!orphanedError && orphanedVotes && orphanedVotes.length > 0) {
        console.log(`📝 Found ${orphanedVotes.length} votes without stories - creating stories...`);
        for (const vote of orphanedVotes) {
          try {
            await createDailyVoteStory(supabase, vote, topicId);
          } catch (error) {
            console.error(`Error creating story for vote ${vote.id}:`, error);
          }
        }
      }
      
      // Daily collection: get votes from tracked MPs
      const votes = await collectDailyVotes(topicId, region, supabase);
      
      if (votes.length > 0) {
        await storeDailyVotes(supabase, votes, topicId);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'daily',
          votesCollected: votes.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } else if (mode === 'weekly') {
      // Weekly collection: create roundup of this week's votes
      await createWeeklyRoundup(supabase, topicId, region, constituencies, topic);
      
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'weekly',
          message: 'Weekly roundup created'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

// Collect votes from the last 2 days for daily posts
async function collectDailyVotes(
  topicId: string,
  region: string,
  supabase: any
): Promise<VotingRecord[]> {
  console.log('🔍 Collecting daily votes for topic:', topicId);
  
  // Fetch tracked MPs from database
  const { data: trackedMPs, error: mpError } = await supabase
    .from('topic_tracked_mps')
    .select('*')
    .eq('topic_id', topicId)
    .eq('tracking_enabled', true);

  if (mpError) {
    console.error('❌ Error fetching tracked MPs:', mpError);
    throw mpError;
  }

  if (!trackedMPs || trackedMPs.length === 0) {
    console.log('⚠️ No tracked MPs found. Running auto-detection...');
    
    // Auto-detect MPs for this region
    const { error: autoDetectError } = await supabase.functions.invoke('auto-detect-regional-mps', {
      body: { topicId, region }
    });
    
    if (autoDetectError) {
      console.error('❌ Auto-detection failed:', autoDetectError);
      throw new Error('No MPs tracked and auto-detection failed');
    }
    
    // Retry fetching after auto-detection
    const { data: retryMPs } = await supabase
      .from('topic_tracked_mps')
      .select('*')
      .eq('topic_id', topicId)
      .eq('tracking_enabled', true);
    
    if (!retryMPs || retryMPs.length === 0) {
      throw new Error('No MPs could be detected for this region');
    }
    
    trackedMPs.push(...retryMPs);
  }

  console.log(`📋 Tracking ${trackedMPs.length} MPs`);
  
  const allVotes: VotingRecord[] = [];
  
  for (const mp of trackedMPs) {
    console.log(`Collecting votes for ${mp.mp_name} (${mp.constituency})...`);
    
    try {
      const votes = await collectVotesForMP(mp.mp_id, mp.mp_name, mp.mp_party, mp.constituency, region);
      allVotes.push(...votes);
      console.log(`✅ Found ${votes.length} votes for ${mp.mp_name}`);
    } catch (error) {
      console.error(`❌ Error collecting votes for ${mp.mp_name}:`, error);
    }
  }
  
  return allVotes;
}

// Collect ALL votes by a specific MP
async function collectVotesForMP(
  mpId: number,
  mpName: string,
  party: string,
  constituency: string,
  region: string
): Promise<VotingRecord[]> {
  console.log(`Collecting votes for MP: ${mpName} (${constituency})`);

  const votes: VotingRecord[] = [];
  try {
    const divisionsResponse = await fetch(
      `https://commonsvotes-api.parliament.uk/data/divisions.json/search?queryParameters.memberId=${mpId}&queryParameters.take=10`
    );
    
    if (!divisionsResponse.ok) {
      console.error('Failed to fetch divisions:', divisionsResponse.status);
      return votes;
    }
    
    const divisionsData = await divisionsResponse.json();
    
    // Filter to last 2 days only
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    for (const division of divisionsData || []) {
      const voteDate = new Date(division.Date);
      if (voteDate < twoDaysAgo) continue; // Skip older votes
      
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
      
      const ayeCount = detailData.AyeCount || 0;
      const noCount = detailData.NoCount || 0;
      const outcome = ayeCount > noCount ? 'passed' : 'rejected';
      const title = division.Title || '';
      
      // Detect party whip and rebellion
      const partyWhip = await detectPartyWhip(detailData, party);
      const isRebellion = detectRebellion(voteDirection, partyWhip);
      
      // Categorize the vote
      const category = categorizeVote(title);
      
      // Calculate national relevance
      const nationalRelevance = calculateNationalRelevance(title, ayeCount, noCount);
      
      // Generate local impact summary
      const localImpact = generateLocalImpact(title, region, category);
      
      votes.push({
        mention_type: 'vote',
        mp_name: mpName,
        constituency: constituency,
        party: party,
        vote_title: title,
        vote_date: voteDate.toISOString().split('T')[0],
        vote_direction: voteDirection as 'aye' | 'no' | 'abstain',
        vote_url: `https://commonsvotes.digiminster.com/Divisions/Details/${division.DivisionId}`,
        region_mentioned: region,
        relevance_score: 75, // Default relevance since we track all MP votes
        source_api: 'uk_parliament_commons_votes',
        party_whip_vote: partyWhip,
        is_rebellion: isRebellion,
        vote_category: category,
        national_relevance_score: nationalRelevance,
        local_impact_summary: localImpact,
        vote_outcome: outcome,
        aye_count: ayeCount,
        no_count: noCount,
        import_metadata: {
          api_version: '2.0',
          collection_method: 'comprehensive_mp_voting',
          division_id: division.DivisionId,
          mp_id: mpId,
          comprehensive_tracking: true
        }
      });
      
      console.log(`✓ Collected vote: ${title.substring(0, 60)}... ${isRebellion ? '⚠️ REBELLION' : ''}`);
    }
    
  } catch (error) {
    console.error('Error collecting votes:', error);
  }
  
  return votes;
}

// Detect party whip position by analyzing vote distribution
async function detectPartyWhip(
  divisionData: any,
  party: string
): Promise<'aye' | 'no' | 'free_vote'> {
  const ayes = divisionData.Ayes || [];
  const noes = divisionData.Noes || [];
  
  // Count party members in each lobby
  const partyAyes = ayes.filter((v: any) => v.Party === party).length;
  const partyNoes = noes.filter((v: any) => v.Party === party).length;
  const totalPartyVotes = partyAyes + partyNoes;
  
  if (totalPartyVotes === 0) return 'free_vote';
  
  const ayePercentage = partyAyes / totalPartyVotes;
  
  // If 70%+ voted one way, that's likely the whip
  if (ayePercentage >= 0.7) return 'aye';
  if (ayePercentage <= 0.3) return 'no';
  
  return 'free_vote';
}

// Detect if MP rebelled against party line
function detectRebellion(
  mpVote: 'aye' | 'no' | 'abstain',
  partyWhip?: 'aye' | 'no' | 'free_vote'
): boolean {
  if (!partyWhip || partyWhip === 'free_vote' || mpVote === 'abstain') {
    return false;
  }
  
  return mpVote !== partyWhip;
}

// Categorize vote by analyzing title keywords
function categorizeVote(title: string): string {
  const lower = title.toLowerCase();
  
  if (lower.includes('housing') || lower.includes('homes') || lower.includes('rent')) return 'Housing';
  if (lower.includes('transport') || lower.includes('rail') || lower.includes('road')) return 'Transport';
  if (lower.includes('nhs') || lower.includes('health') || lower.includes('hospital')) return 'NHS';
  if (lower.includes('education') || lower.includes('school') || lower.includes('university')) return 'Education';
  if (lower.includes('environment') || lower.includes('climate') || lower.includes('green')) return 'Environment';
  if (lower.includes('police') || lower.includes('crime') || lower.includes('justice')) return 'Justice';
  if (lower.includes('tax') || lower.includes('budget') || lower.includes('economy')) return 'Economy';
  if (lower.includes('defence') || lower.includes('military') || lower.includes('armed forces')) return 'Defence';
  if (lower.includes('immigration') || lower.includes('asylum') || lower.includes('border')) return 'Immigration';
  if (lower.includes('welfare') || lower.includes('benefit') || lower.includes('pension')) return 'Welfare';
  
  return 'General Legislation';
}

// Calculate national relevance score (0-100)
function calculateNationalRelevance(title: string, ayeCount: number, noCount: number): number {
  let score = 50; // Base score
  
  const totalVotes = ayeCount + noCount;
  const margin = Math.abs(ayeCount - noCount);
  const marginPercentage = margin / totalVotes;
  
  // High turnout = more important
  if (totalVotes > 500) score += 20;
  else if (totalVotes > 400) score += 10;
  
  // Close vote = more significant
  if (marginPercentage < 0.1) score += 20; // Within 10%
  else if (marginPercentage < 0.2) score += 10; // Within 20%
  
  // Budget/major bills
  if (title.toLowerCase().includes('budget') || 
      title.toLowerCase().includes('finance bill') ||
      title.toLowerCase().includes('spending review')) {
    score += 20;
  }
  
  return Math.min(100, Math.max(0, score));
}

// Generate local impact summary
function generateLocalImpact(title: string, region: string, category: string): string {
  const lower = title.toLowerCase();
  
  if (category === 'Housing') {
    return `This ${title.toLowerCase().includes('rent') ? 'rental' : 'housing'} legislation will affect ${region} residents, particularly in terms of ${lower.includes('afford') ? 'housing affordability' : 'local development'}.`;
  }
  
  if (category === 'Transport') {
    return `Transport infrastructure decisions impact ${region}'s connectivity and local commuters' daily journeys.`;
  }
  
  if (category === 'NHS') {
    return `NHS funding and service decisions directly affect healthcare provision for ${region} residents.`;
  }
  
  if (category === 'Education') {
    return `Education policy affects schools and families across ${region}, including funding and curriculum standards.`;
  }
  
  if (category === 'Environment') {
    return `Environmental legislation impacts ${region}'s local environment, green spaces, and sustainability goals.`;
  }
  
  return `This legislative decision at Westminster affects ${region} as part of national policy implementation.`;
}

// Store daily votes as individual stories
async function storeDailyVotes(supabase: any, votes: VotingRecord[], topicId: string) {
  console.log(`Storing ${votes.length} daily votes`);

  for (const vote of votes) {
    try {
      const existingVoteQuery = supabase
        .from('parliamentary_mentions')
        .select('id, story_id')
        .eq('topic_id', topicId)
        .eq('mention_type', 'vote')
        .eq('vote_url', vote.vote_url)
        .eq('mp_name', vote.mp_name)
        .limit(1);

      const { data: existingVote, error: existingVoteError } = await existingVoteQuery.maybeSingle();

      if (existingVoteError) {
        console.error('Error checking for existing vote:', existingVoteError);
      }

      const voteRecord = {
        topic_id: topicId,
        mention_type: 'vote',
        mp_name: vote.mp_name,
        constituency: vote.constituency,
        party: vote.party,
        vote_title: vote.vote_title,
        vote_date: vote.vote_date,
        vote_direction: vote.vote_direction,
        vote_url: vote.vote_url,
        region_mentioned: vote.region_mentioned,
        relevance_score: vote.relevance_score,
        source_api: vote.source_api,
        party_whip_vote: vote.party_whip_vote,
        is_rebellion: vote.is_rebellion,
        vote_category: vote.vote_category,
        national_relevance_score: vote.national_relevance_score,
        local_impact_summary: vote.local_impact_summary,
        vote_outcome: vote.vote_outcome,
        aye_count: vote.aye_count,
        no_count: vote.no_count,
        is_weekly_roundup: false,
        week_start_date: null,
        import_metadata: vote.import_metadata
      };

      if (existingVote) {
        const { error: updateError } = await supabase
          .from('parliamentary_mentions')
          .update(voteRecord)
          .eq('id', existingVote.id);

        if (updateError) {
          console.error('Error updating existing vote:', updateError);
          continue;
        }

        if (!existingVote.story_id) {
          const { data: refreshedVote, error: refreshedError } = await supabase
            .from('parliamentary_mentions')
            .select('*')
            .eq('id', existingVote.id)
            .single();

          if (refreshedError) {
            console.error('Error loading refreshed vote for story creation:', refreshedError);
            continue;
          }

          await createDailyVoteStory(supabase, refreshedVote, topicId);
        }

        continue;
      }

      // Insert the voting record
      const { data: insertedVote, error: insertError } = await supabase
        .from('parliamentary_mentions')
        .insert(voteRecord)
        .select()
        .single();
      
      if (insertError) {
        console.error('Error inserting vote:', insertError);
        continue;
      }
      
      // Create single-slide banner story
      await createDailyVoteStory(supabase, insertedVote, topicId);
      
    } catch (error) {
      console.error('Error processing vote:', error);
    }
  }
}

// Create a single-slide banner story for a daily vote
async function createDailyVoteStory(supabase: any, vote: any, topicId: string) {
  try {
    // Create shared content
    const { data: sharedContent, error: contentError } = await supabase
      .from('shared_article_content')
      .insert({
        url: vote.vote_url,
        normalized_url: vote.vote_url?.toLowerCase(),
        title: `${vote.mp_name} voted ${vote.vote_direction} on ${vote.vote_title}`,
        body: vote.local_impact_summary,
        published_at: vote.vote_date,
        word_count: 50,
        language: 'en'
      })
      .select()
      .single();
    
    if (contentError) throw contentError;
    
    // Create topic article
    const { data: topicArticle, error: topicArticleError } = await supabase
      .from('topic_articles')
      .insert({
        topic_id: topicId,
        shared_content_id: sharedContent.id,
        processing_status: 'processed',
        regional_relevance_score: vote.relevance_score,
        content_quality_score: 80,
        import_metadata: {
          source: 'parliamentary_vote',
          mention_id: vote.id,
          is_rebellion: vote.is_rebellion
        }
      })
      .select()
      .single();
    
    if (topicArticleError) throw topicArticleError;
    
    // Create story
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
        writing_style: 'journalistic'
      })
      .select()
      .single();
    
    if (storyError) throw storyError;
    
    // Create single slide (banner style)
    const slideContent = `**${new Date(vote.vote_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}** – ${vote.mp_name} (${vote.party}) voted **${vote.vote_direction.toUpperCase()}** on ${vote.vote_title}

${vote.local_impact_summary}

Vote outcome: **${vote.vote_outcome.toUpperCase()}** (${vote.aye_count} Ayes, ${vote.no_count} Noes)
${vote.is_rebellion ? '\n⚠️ **Voted against ' + vote.party + ' party line**' : ''}

📊 Category: ${vote.vote_category}`;
    
    const { error: slideError } = await supabase
      .from('slides')
      .insert({
        story_id: story.id,
        slide_number: 1,
        content: slideContent,
        word_count: slideContent.split(' ').length,
        links: [{
          text: 'View on Parliament.uk',
          url: vote.vote_url
        }]
      });
    
    if (slideError) throw slideError;
    
    // Update parliamentary mention with story_id
    await supabase
      .from('parliamentary_mentions')
      .update({ story_id: story.id })
      .eq('id', vote.id);
    
    console.log(`✓ Created daily vote story: ${story.title}`);
    
  } catch (error) {
    console.error('Error creating daily vote story:', error);
  }
}

// Create weekly roundup story
async function createWeeklyRoundup(
  supabase: any,
  topicId: string,
  region: string,
  constituencies: string[],
  topic: any
) {
  console.log('Creating weekly roundup');
  
  // Get Monday of this week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  
  const mondayStr = monday.toISOString().split('T')[0];
  
  // Get all votes from this week for this topic
  const { data: weekVotes, error: votesError } = await supabase
    .from('parliamentary_mentions')
    .select('*')
    .eq('topic_id', topicId)
    .eq('mention_type', 'vote')
    .gte('vote_date', mondayStr)
    .eq('is_weekly_roundup', false)
    .order('vote_date', { ascending: false });
  
  if (votesError || !weekVotes || weekVotes.length === 0) {
    console.log('No votes to create roundup from');
    return;
  }
  
  const mp = weekVotes[0];
  const rebellionCount = weekVotes.filter((v: any) => v.is_rebellion).length;
  const categories = [...new Set(weekVotes.map((v: any) => v.vote_category))];
  
  // Create weekly roundup story
  try {
    const { data: sharedContent, error: contentError } = await supabase
      .from('shared_article_content')
      .insert({
        url: mp.vote_url,
        normalized_url: mp.vote_url?.toLowerCase(),
        title: `${mp.mp_name}'s Week in Parliament: ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`,
        body: `Weekly voting roundup for ${mp.constituency}`,
        published_at: new Date().toISOString().split('T')[0],
        word_count: 300,
        language: 'en'
      })
      .select()
      .single();
    
    if (contentError) throw contentError;
    
    const { data: topicArticle, error: topicArticleError } = await supabase
      .from('topic_articles')
      .insert({
        topic_id: topicId,
        shared_content_id: sharedContent.id,
        processing_status: 'processed',
        regional_relevance_score: 90,
        content_quality_score: 85
      })
      .select()
      .single();
    
    if (topicArticleError) throw topicArticleError;
    
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .insert({
        topic_article_id: topicArticle.id,
        shared_content_id: sharedContent.id,
        title: sharedContent.title,
        status: 'ready',
        is_published: true,
        is_parliamentary: true,
        audience_expertise: 'general',
        tone: 'formal',
        writing_style: 'journalistic'
      })
      .select()
      .single();
    
    if (storyError) throw storyError;
    
    // Intro slide
    const introContent = `**${mp.mp_name}'s Voting Record**
Week of ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

**${weekVotes.length}** parliamentary votes this week
${rebellionCount > 0 ? `**${rebellionCount}** votes against party line\n` : ''}
**Key categories:** ${categories.slice(0, 3).join(', ')}`;
    
    await supabase.from('slides').insert({
      story_id: story.id,
      slide_number: 1,
      content: introContent,
      word_count: introContent.split(' ').length
    });
    
    // One slide per vote
    let slideNum = 2;
    for (const vote of weekVotes) {
      const voteContent = `**${new Date(vote.vote_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}** – Voted **${vote.vote_direction.toUpperCase()}**

${vote.vote_title}

${vote.local_impact_summary}

${vote.is_rebellion ? '⚠️ **Against party line**\n' : ''}Outcome: **${vote.vote_outcome.toUpperCase()}** (${vote.aye_count}-${vote.no_count})
Category: ${vote.vote_category}`;
      
      await supabase.from('slides').insert({
        story_id: story.id,
        slide_number: slideNum++,
        content: voteContent,
        word_count: voteContent.split(' ').length,
        links: [{ text: 'View Vote', url: vote.vote_url }]
      });
    }
    
    console.log(`✓ Created weekly roundup: ${weekVotes.length} votes`);
    
  } catch (error) {
    console.error('Error creating weekly roundup:', error);
  }
}
