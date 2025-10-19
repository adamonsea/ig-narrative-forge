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

// Helper functions for robust MP matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(mr|ms|mrs|dr|rt hon|sir|dame|lord|lady)\.?\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeConstituency(constituency: string): string {
  return (constituency || '').toLowerCase().trim();
}

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
      // First, fetch tracked MPs for validation
      const { data: trackedMPs, error: trackedError } = await supabase
        .from('topic_tracked_mps')
        .select('mp_id, mp_name, constituency')
        .eq('topic_id', topicId)
        .eq('tracking_enabled', true);
      
      if (trackedError) {
        console.error('Error fetching tracked MPs:', trackedError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch tracked MPs' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Build lookup maps for tracked MPs
      const trackedByMpId = new Set((trackedMPs || []).map(mp => mp.mp_id).filter(Boolean));
      const trackedByNameConstituency = new Set(
        (trackedMPs || []).map(mp => 
          `${normalizeName(mp.mp_name)}|${normalizeConstituency(mp.constituency)}`
        )
      );
      
      console.log(`📋 Validated ${trackedMPs?.length || 0} tracked MPs for filtering`);
      
      // Backfill any existing votes that don't have stories, but ONLY for tracked MPs
      console.log('🔄 Checking for existing votes without stories...');
      const { data: orphanedVotes, error: orphanedError } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('topic_id', topicId)
        .is('story_id', null)
        .eq('is_weekly_roundup', false);
      
      // Clean up ALL invalid votes, not just orphaned ones
      console.log('🧹 Cleaning up all invalid parliamentary mentions...');
      const { data: allVotes, error: allVotesError } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('topic_id', topicId);
      
      if (!allVotesError && allVotes) {
        let deletedCount = 0;
        let validCount = 0;
        
        for (const vote of allVotes) {
          const mpId = vote.import_metadata?.mp_id;
          const nameConstKey = `${normalizeName(vote.mp_name)}|${normalizeConstituency(vote.constituency)}`;
          const isTracked = (mpId && trackedByMpId.has(mpId)) || trackedByNameConstituency.has(nameConstKey);
          
          if (!isTracked) {
            console.log(`🗑️ Deleting vote from untracked MP: ${vote.mp_name} (${vote.constituency})`);
            await supabase
              .from('parliamentary_mentions')
              .delete()
              .eq('id', vote.id);
            deletedCount++;
          } else {
            validCount++;
          }
        }
        
        console.log(`✅ Cleanup complete: ${validCount} valid votes kept, ${deletedCount} invalid votes deleted`);
      }
      
      // Now process orphaned votes (votes without stories) from tracked MPs only
      if (!orphanedError && orphanedVotes && orphanedVotes.length > 0) {
        console.log(`📝 Found ${orphanedVotes.length} votes without stories - creating stories...`);
        
        let processedCount = 0;
        
        for (const vote of orphanedVotes) {
          try {
            const mpId = vote.import_metadata?.mp_id;
            const nameConstKey = `${normalizeName(vote.mp_name)}|${normalizeConstituency(vote.constituency)}`;
            const isTracked = (mpId && trackedByMpId.has(mpId)) || trackedByNameConstituency.has(nameConstKey);
            
            if (isTracked) {
              await createDailyVoteStory(supabase, vote, topicId);
              processedCount++;
            }
          } catch (error) {
            console.error(`Error creating story for vote ${vote.id}:`, error);
          }
        }
        
        console.log(`✅ Created ${processedCount} stories for tracked MPs`);
      }
      
      // Check for stories with mismatched MP names and delete them
      console.log('🔍 Checking for stories with mismatched MP names...');
      const { data: storiesWithMentions, error: mentionsError } = await supabase
        .from('parliamentary_mentions')
        .select('id, mp_name, story_id, stories(id, title)')
        .eq('topic_id', topicId)
        .not('story_id', 'is', null);
      
      if (!mentionsError && storiesWithMentions) {
        let mismatchCount = 0;
        for (const mention of storiesWithMentions) {
          if (mention.stories && !mention.stories.title.includes(mention.mp_name)) {
            console.log(`🗑️ Deleting story with mismatched MP name: "${mention.stories.title}" (should contain "${mention.mp_name}")`);
            
            // Delete the story via cascade function
            const { error: deleteError } = await supabase.functions.invoke('delete-story-cascade', {
              body: { story_id: mention.stories.id }
            });
            
            if (deleteError) {
              console.error(`Error deleting mismatched story ${mention.stories.id}:`, deleteError);
            } else {
              mismatchCount++;
            }
          }
        }
        console.log(`✅ Deleted ${mismatchCount} stories with mismatched MP names`);
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
      // Validate that this MP is actually tracked for this topic
      // Prefer mp_id lookup for robustness, fallback to name+constituency
      const mpId = vote.import_metadata?.mp_id;
      
      let trackedMp;
      if (mpId) {
        // Primary: lookup by mp_id
        const { data, error } = await supabase
          .from('topic_tracked_mps')
          .select('mp_id, mp_name, constituency')
          .eq('topic_id', topicId)
          .eq('mp_id', mpId)
          .eq('tracking_enabled', true)
          .maybeSingle();
        
        if (error) {
          console.error('Error checking tracked MPs by mp_id:', error);
        }
        trackedMp = data;
      }
      
      if (!trackedMp) {
        // Fallback: lookup by normalized name + constituency
        const { data: allTracked, error: allError } = await supabase
          .from('topic_tracked_mps')
          .select('mp_id, mp_name, constituency')
          .eq('topic_id', topicId)
          .eq('tracking_enabled', true);
        
        if (allError) {
          console.error('Error checking tracked MPs by name:', allError);
        }
        
        trackedMp = (allTracked || []).find(mp => 
          normalizeName(mp.mp_name) === normalizeName(vote.mp_name) &&
          normalizeConstituency(mp.constituency) === normalizeConstituency(vote.constituency)
        );
      }
      
      // Skip if MP is not tracked for this topic
      if (!trackedMp) {
        console.log(`⏭️ Skipping vote for ${vote.mp_name} (${vote.constituency}) - not tracked for this topic`);
        continue;
      }
      
      // Verify constituency matches (normalized comparison)
      if (normalizeConstituency(trackedMp.constituency) !== normalizeConstituency(vote.constituency)) {
        console.log(`⏭️ Skipping vote for ${vote.mp_name} - constituency mismatch (expected: ${trackedMp.constituency}, got: ${vote.constituency})`);
        continue;
      }
      
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
    // Check if shared content already exists (with MP-specific URL)
    const mpSpecificUrl = `${vote.vote_url}?mp=${vote.mp_id || 'unknown'}`;
    let sharedContent;
    const { data: existingContent } = await supabase
      .from('shared_article_content')
      .select('id, title')
      .eq('url', mpSpecificUrl)
      .maybeSingle();
    
    if (existingContent) {
      console.log(`♻️ Reusing existing shared content for vote ${vote.id}`);
      sharedContent = existingContent;
    } else {
      // Create new shared content with MP-specific URL
      const { data: newContent, error: contentError } = await supabase
        .from('shared_article_content')
        .insert({
          url: mpSpecificUrl,
          normalized_url: mpSpecificUrl.toLowerCase(),
          title: `${vote.mp_name} voted ${vote.vote_direction} on ${vote.vote_title}`,
          body: vote.local_impact_summary,
          published_at: vote.vote_date,
          word_count: 50,
          language: 'en'
        })
        .select()
        .single();
      
      if (contentError) throw contentError;
      sharedContent = newContent;
    }
    
    // Check if topic article already exists
    let topicArticle;
    const { data: existingTopicArticle } = await supabase
      .from('topic_articles')
      .select('id')
      .eq('shared_content_id', sharedContent.id)
      .eq('topic_id', topicId)
      .maybeSingle();
    
    if (existingTopicArticle) {
      console.log(`♻️ Reusing existing topic article for vote ${vote.id}`);
      topicArticle = existingTopicArticle;
    } else {
      // Create new topic article
      const { data: newTopicArticle, error: topicArticleError } = await supabase
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
      topicArticle = newTopicArticle;
    }
    
    // Check if story already exists
    const { data: existingStory } = await supabase
      .from('stories')
      .select('id, title')
      .eq('shared_content_id', sharedContent.id)
      .maybeSingle();
    
    let story;
    if (existingStory) {
      console.log(`✓ Story already exists for vote ${vote.id}`);
      story = existingStory;
    } else {
      // Create new story
      const { data: newStory, error: storyError } = await supabase
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
      story = newStory;
      
      // Format vote date
      const voteDate = new Date(vote.vote_date).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });

      // Helper to map outcome
      const mapOutcome = (outcome: string) => outcome.toLowerCase() === 'passed' ? 'ACCEPTED' : 'REJECTED';

      // Get topic name for slide 4
      const { data: topicData } = await supabase
        .from('topics')
        .select('name')
        .eq('id', topicId)
        .single();
      const topicName = topicData?.name || 'this area';

      // Slide 1: MP prefix, name, date (smaller/separate), vote title (body text)
      const slide1Content = `MP ${vote.mp_name}

${voteDate}

${vote.vote_title}`;

      // Slide 2: Small "Voted", large vote direction, optional rebellion indicator
      const rebellionIndicator = vote.is_rebellion ? '\n\n🔥 Against party whip' : '';
      const slide2Content = `Voted

${vote.vote_direction.toUpperCase()}${rebellionIndicator}`;

      // Slide 3: Small "Vote outcome", large outcome, small counts
      const slide3Content = `Vote outcome

${mapOutcome(vote.vote_outcome)}

Ayes ${vote.aye_count}, Nos ${vote.no_count}`;

      // Slide 4: Category and local impact
      const slide4Content = `Category: ${vote.vote_category}

Information: This legislative decision at Westminster affects ${topicName} as part of national policy implementation`;

      // Slide 5: Link button only
      const slide5Content = `View vote details on Parliament.uk`;

      // Insert all 5 slides
      const slides = [
        { slide_number: 1, content: slide1Content, links: [] },
        { slide_number: 2, content: slide2Content, links: [] },
        { slide_number: 3, content: slide3Content, links: [] },
        { slide_number: 4, content: slide4Content, links: [] },
        { slide_number: 5, content: slide5Content, links: [{ text: 'View vote details', url: vote.vote_url, start: 0, end: 16 }] }
      ];

      for (const slideData of slides) {
        const { error: slideError } = await supabase
          .from('slides')
          .insert({
            story_id: story.id,
            slide_number: slideData.slide_number,
            content: slideData.content,
            word_count: slideData.content.split(' ').length,
            links: slideData.links
          });
        
        if (slideError) throw slideError;
      }
      
      console.log(`✓ Created daily vote story: ${story.title}`);
    }
    
    // Update parliamentary mention with story_id
    await supabase
      .from('parliamentary_mentions')
      .update({ story_id: story.id })
      .eq('id', vote.id);
    
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
