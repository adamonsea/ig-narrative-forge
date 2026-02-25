// UK Parliament Voting Record Collector
// Fetches comprehensive MP voting records for regional topics
// Stores data in parliamentary_mentions ONLY — no stories/slides created

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
  is_major_vote?: boolean;
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
      // Fetch tracked MPs for validation
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
      
      // Clean up votes from untracked MPs
      console.log('🧹 Cleaning up invalid parliamentary mentions...');
      const { data: allVotes, error: allVotesError } = await supabase
        .from('parliamentary_mentions')
        .select('id, mp_name, constituency, import_metadata')
        .eq('topic_id', topicId);
      
      if (!allVotesError && allVotes) {
        let deletedCount = 0;
        
        for (const vote of allVotes) {
          const mpId = vote.import_metadata?.mp_id;
          const nameConstKey = `${normalizeName(vote.mp_name)}|${normalizeConstituency(vote.constituency)}`;
          const isTracked = (mpId && trackedByMpId.has(mpId)) || trackedByNameConstituency.has(nameConstKey);
          
          if (!isTracked) {
            await supabase
              .from('parliamentary_mentions')
              .delete()
              .eq('id', vote.id);
            deletedCount++;
          }
        }
        
        if (deletedCount > 0) {
          console.log(`✅ Deleted ${deletedCount} votes from untracked MPs`);
        }
      }
      
      // Daily collection: get votes from tracked MPs
      const votes = await collectDailyVotes(topicId, region, supabase);
      
      if (votes.length > 0) {
        await storeDailyVotes(supabase, votes, topicId);
        
        // Trigger AI context generation for new votes (fire and forget)
        supabase.functions.invoke('generate-vote-context', {
          body: { batchMode: true }
        }).catch(err => console.error('Context generation trigger error:', err));
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
      // Weekly mode now just ensures all votes are collected — no story creation
      console.log('Weekly mode: running daily collection to ensure completeness');
      const votes = await collectDailyVotes(topicId, region, supabase);
      
      if (votes.length > 0) {
        await storeDailyVotes(supabase, votes, topicId);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'weekly',
          message: 'Weekly collection completed (mentions only)',
          votesCollected: votes.length
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

// Collect votes from the last 14 days for tracked MPs
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
    
    const { error: autoDetectError } = await supabase.functions.invoke('auto-detect-regional-mps', {
      body: { topicId, region }
    });
    
    if (autoDetectError) {
      console.error('❌ Auto-detection failed:', autoDetectError);
      throw new Error('No MPs tracked and auto-detection failed');
    }
    
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
    // Validate party data before collection
    if (!mp.mp_party || mp.mp_party.trim() === '') {
      console.warn(`⚠️ Missing party data for ${mp.mp_name}, fetching from Parliament API...`);
      const mpInfo = await fetchCurrentMpForConstituency(mp.constituency);
      if (mpInfo) {
        mp.mp_party = mpInfo.party || 'Unknown';
        await supabase
          .from('topic_tracked_mps')
          .update({ mp_party: mp.mp_party })
          .eq('id', mp.id);
      }
    }
    
    console.log(`📊 Collecting votes for ${mp.mp_name} (${mp.mp_party})`);
    
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
      `https://commonsvotes-api.parliament.uk/data/divisions.json/search?queryParameters.memberId=${mpId}&queryParameters.take=50`
    );
    
    if (!divisionsResponse.ok) {
      console.error('Failed to fetch divisions:', divisionsResponse.status);
      return votes;
    }
    
    const divisionsData = await divisionsResponse.json();
    
    // Filter to last 14 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);
    const endDate = new Date();
    
    for (const division of divisionsData || []) {
      const voteDate = new Date(division.Date);
      if (voteDate < startDate) continue;
      
      const detailResponse = await fetch(
        `https://commonsvotes-api.parliament.uk/data/division/${division.DivisionId}.json`
      );
      
      if (!detailResponse.ok) continue;
      
      const detailData = await detailResponse.json();
      
      const ayeVote = detailData.Ayes?.find((v: any) => v.MemberId === mpId);
      const noVote = detailData.Noes?.find((v: any) => v.MemberId === mpId);
      const voteDirection = ayeVote ? 'aye' : noVote ? 'no' : 'abstain';
      
      const ayeCount = detailData.AyeCount || 0;
      const noCount = detailData.NoCount || 0;
      const outcome = ayeCount > noCount ? 'passed' : 'rejected';
      const title = division.Title || '';
      
      const billDescription = detailData.Description || '';
      const billStage = detailData.PublicationUpdated || detailData.DivisionWasExclusivelyWhileOnline ? 'Committee' : 'Main Chamber';
      
      const partyWhip = await detectPartyWhip(detailData, party);
      const isRebellion = detectRebellion(voteDirection, partyWhip);
      const category = categorizeVote(title);
      const nationalRelevance = calculateNationalRelevance(title, ayeCount, noCount);
      const localImpact = generateLocalImpact(title, region, category);
      
      // Determine if this is a MAJOR vote
      const totalVotes = ayeCount + noCount;
      const voteMargin = totalVotes > 0 ? Math.abs(ayeCount - noCount) / totalVotes : 1;
      const isCloseVote = voteMargin < 0.1;
      const isMajorPolicy = ['Economy', 'NHS', 'Education', 'Housing'].includes(category) && totalVotes > 400;
      const isMajorVote = isRebellion || isCloseVote || nationalRelevance > 75 || isMajorPolicy;
      
      votes.push({
        mention_type: 'vote',
        mp_name: mpName,
        constituency: constituency,
        party: party || 'Unknown',
        vote_title: title,
        vote_date: voteDate.toISOString().split('T')[0],
        vote_direction: voteDirection as 'aye' | 'no' | 'abstain',
        vote_url: `https://votes.parliament.uk/votes/commons/division/${division.DivisionId}`,
        region_mentioned: region,
        relevance_score: 75,
        source_api: 'uk_parliament_commons_votes',
        party_whip_vote: partyWhip,
        is_rebellion: isRebellion,
        vote_category: category,
        national_relevance_score: nationalRelevance,
        local_impact_summary: localImpact,
        vote_outcome: outcome,
        aye_count: ayeCount,
        no_count: noCount,
        is_major_vote: isMajorVote,
        import_metadata: {
          api_version: '2.0',
          collection_method: 'comprehensive_mp_voting',
          division_id: division.DivisionId,
          mp_id: mpId,
          comprehensive_tracking: true,
          bill_description: billDescription,
          bill_stage: billStage,
          is_close_vote: isCloseVote,
          is_major_policy: isMajorPolicy
        }
      });
      
      console.log(`✓ Collected vote: ${title.substring(0, 60)}... ${isMajorVote ? '⭐ MAJOR' : ''} ${isRebellion ? '⚠️ REBELLION' : ''}`);
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
  
  const partyAyes = ayes.filter((v: any) => v.Party === party).length;
  const partyNoes = noes.filter((v: any) => v.Party === party).length;
  const totalPartyVotes = partyAyes + partyNoes;
  
  if (totalPartyVotes === 0) return 'free_vote';
  
  const ayePercentage = partyAyes / totalPartyVotes;
  
  if (ayePercentage >= 0.7) return 'aye';
  if (ayePercentage <= 0.3) return 'no';
  
  return 'free_vote';
}

function detectRebellion(
  mpVote: 'aye' | 'no' | 'abstain',
  partyWhip?: 'aye' | 'no' | 'free_vote'
): boolean {
  if (!partyWhip || partyWhip === 'free_vote' || mpVote === 'abstain') {
    return false;
  }
  return mpVote !== partyWhip;
}

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

function calculateNationalRelevance(title: string, ayeCount: number, noCount: number): number {
  let score = 50;
  
  const totalVotes = ayeCount + noCount;
  const margin = Math.abs(ayeCount - noCount);
  const marginPercentage = margin / totalVotes;
  
  if (totalVotes > 500) score += 20;
  else if (totalVotes > 400) score += 10;
  
  if (marginPercentage < 0.1) score += 20;
  else if (marginPercentage < 0.2) score += 10;
  
  if (title.toLowerCase().includes('budget') || 
      title.toLowerCase().includes('finance bill') ||
      title.toLowerCase().includes('spending review')) {
    score += 20;
  }
  
  return Math.min(100, Math.max(0, score));
}

function generateLocalImpact(title: string, region: string, category: string): string {
  if (category === 'Housing') {
    return `This ${title.toLowerCase().includes('rent') ? 'rental' : 'housing'} legislation will affect ${region} residents, particularly in terms of ${title.toLowerCase().includes('afford') ? 'housing affordability' : 'local development'}.`;
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

// Store daily votes as mentions only — no stories or slides created
async function storeDailyVotes(supabase: any, votes: VotingRecord[], topicId: string) {
  console.log(`Storing ${votes.length} daily votes (mentions only)`);

  for (const vote of votes) {
    try {
      // Validate that this MP is actually tracked for this topic
      const mpId = vote.import_metadata?.mp_id;
      
      let trackedMp;
      if (mpId) {
        const { data, error } = await supabase
          .from('topic_tracked_mps')
          .select('mp_id, mp_name, constituency')
          .eq('topic_id', topicId)
          .eq('mp_id', mpId)
          .eq('tracking_enabled', true)
          .maybeSingle();
        
        if (error) console.error('Error checking tracked MPs by mp_id:', error);
        trackedMp = data;
      }
      
      if (!trackedMp) {
        const { data: allTracked, error: allError } = await supabase
          .from('topic_tracked_mps')
          .select('mp_id, mp_name, constituency')
          .eq('topic_id', topicId)
          .eq('tracking_enabled', true);
        
        if (allError) console.error('Error checking tracked MPs by name:', allError);
        
        trackedMp = (allTracked || []).find(mp => 
          normalizeName(mp.mp_name) === normalizeName(vote.mp_name) &&
          normalizeConstituency(mp.constituency) === normalizeConstituency(vote.constituency)
        );
      }
      
      if (!trackedMp) {
        console.log(`⏭️ Skipping vote for ${vote.mp_name} (${vote.constituency}) - not tracked`);
        continue;
      }
      
      if (normalizeConstituency(trackedMp.constituency) !== normalizeConstituency(vote.constituency)) {
        console.log(`⏭️ Skipping vote for ${vote.mp_name} - constituency mismatch`);
        continue;
      }
      
      // Check if vote already exists
      const { data: existingVote, error: existingVoteError } = await supabase
        .from('parliamentary_mentions')
        .select('id')
        .eq('topic_id', topicId)
        .eq('mention_type', 'vote')
        .eq('vote_url', vote.vote_url)
        .eq('mp_name', vote.mp_name)
        .limit(1)
        .maybeSingle();

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
        is_major_vote: vote.is_major_vote || false,
        week_start_date: null,
        import_metadata: vote.import_metadata
      };

      if (existingVote) {
        await supabase
          .from('parliamentary_mentions')
          .update(voteRecord)
          .eq('id', existingVote.id);
        console.log(`♻️ Updated existing vote: ${vote.vote_title?.substring(0, 50)}...`);
      } else {
        await supabase
          .from('parliamentary_mentions')
          .insert(voteRecord);
        console.log(`✅ Stored new vote: ${vote.vote_title?.substring(0, 50)}... ${vote.is_major_vote ? '⭐ MAJOR' : ''}`);
      }
      
    } catch (error) {
      console.error('Error processing vote:', error);
    }
  }
}
