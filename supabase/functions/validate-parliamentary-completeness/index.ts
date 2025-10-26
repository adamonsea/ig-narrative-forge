import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  topicId: string;
  days?: number; // Default 30 days
}

interface VoteFromAPI {
  divisionId: number;
  title: string;
  date: string;
  voteDirection: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { topicId, days = 30 } = await req.json() as ValidationRequest;
    
    console.log(`🔍 Validating parliamentary completeness for topic ${topicId} (last ${days} days)`);

    // Get topic details and tracked MPs
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, region, parliamentary_last_collection_at')
      .eq('id', topicId)
      .single();

    if (topicError) throw new Error(`Topic not found: ${topicError.message}`);

    const { data: trackedMPs, error: mpsError } = await supabase
      .from('topic_tracked_mps')
      .select('mp_id, mp_name, constituency')
      .eq('topic_id', topicId)
      .eq('tracking_enabled', true);

    if (mpsError) throw new Error(`Failed to fetch tracked MPs: ${mpsError.message}`);

    if (!trackedMPs || trackedMPs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No MPs tracked for this topic',
        topic: topic.name,
        validation: {
          trackedMPs: 0,
          databaseVotes: 0,
          parliamentAPIVotes: 0,
          missingVotes: 0,
          orphanedVotes: 0
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📊 Checking ${trackedMPs.length} tracked MPs`);

    // Get votes from database
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const { data: dbVotes, error: votesError } = await supabase
      .from('parliamentary_mentions')
      .select('id, mp_name, vote_date, vote_title, story_id, division_id')
      .eq('topic_id', topicId)
      .eq('mention_type', 'vote')
      .gte('vote_date', startDate.toISOString())
      .lte('vote_date', endDate.toISOString());

    if (votesError) throw new Error(`Failed to fetch database votes: ${votesError.message}`);

    const dbVotesByDivisionId = new Map(dbVotes?.map(v => [v.division_id, v]) || []);
    console.log(`💾 Database has ${dbVotes?.length || 0} votes`);

    // Fetch votes from Parliament API for each MP
    const parliamentVotes: Map<number, VoteFromAPI> = new Map();
    const mpResults: any[] = [];

    for (const mp of trackedMPs) {
      try {
        console.log(`🔍 Fetching votes for ${mp.mp_name} (ID: ${mp.mp_id})`);
        
        // Fetch from Commons Votes API
        const apiUrl = `https://commonsvotes-api.parliament.uk/data/divisions.json/membervoting?queryParameters.memberId=${mp.mp_id}&queryParameters.take=100`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          console.error(`❌ Failed to fetch votes for MP ${mp.mp_name}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const mpVotes = data.items || [];
        
        // Filter to date range
        const filteredVotes = mpVotes.filter((vote: any) => {
          const voteDate = new Date(vote.Date);
          return voteDate >= startDate && voteDate <= endDate;
        });

        console.log(`  Found ${filteredVotes.length} votes for ${mp.mp_name} in date range`);

        // Add to map
        filteredVotes.forEach((vote: any) => {
          if (!parliamentVotes.has(vote.DivisionId)) {
            parliamentVotes.set(vote.DivisionId, {
              divisionId: vote.DivisionId,
              title: vote.Title,
              date: vote.Date,
              voteDirection: vote.MemberVotedAye ? 'aye' : 'no'
            });
          }
        });

        mpResults.push({
          mp_id: mp.mp_id,
          mp_name: mp.mp_name,
          constituency: mp.constituency,
          votesFromAPI: filteredVotes.length,
          votesInDB: (dbVotes || []).filter(v => v.mp_name === mp.mp_name).length
        });

      } catch (error) {
        console.error(`❌ Error fetching votes for ${mp.mp_name}:`, error);
        mpResults.push({
          mp_id: mp.mp_id,
          mp_name: mp.mp_name,
          constituency: mp.constituency,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Compare Parliament API vs Database
    const missingVotes: any[] = [];
    const orphanedVotes = (dbVotes || []).filter(v => !v.story_id);

    parliamentVotes.forEach((apiVote, divisionId) => {
      if (!dbVotesByDivisionId.has(divisionId)) {
        missingVotes.push({
          division_id: divisionId,
          title: apiVote.title,
          date: apiVote.date,
          inDatabase: false
        });
      }
    });

    // Calculate gaps (days with no votes when Parliament was active)
    const daysWithVotes = new Set([...parliamentVotes.values()].map(v => 
      new Date(v.date).toISOString().split('T')[0]
    ));
    
    const allDays: string[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      // Exclude weekends and known recess periods
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        allDays.push(d.toISOString().split('T')[0]);
      }
    }

    const missingDays = allDays.filter(day => !daysWithVotes.has(day) && parliamentVotes.size > 0);

    const result = {
      success: true,
      topic: topic.name,
      lastCollectionAt: topic.parliamentary_last_collection_at,
      validation: {
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        trackedMPs: trackedMPs.length,
        databaseVotes: dbVotes?.length || 0,
        parliamentAPIVotes: parliamentVotes.size,
        missingVotes: missingVotes.length,
        orphanedVotes: orphanedVotes.length,
        completeness: parliamentVotes.size > 0 
          ? Math.round(((dbVotes?.length || 0) / parliamentVotes.size) * 100) 
          : 100,
        gapDetection: {
          totalWorkingDays: allDays.length,
          daysWithVotes: daysWithVotes.size,
          potentialGaps: missingDays.length > 10 ? missingDays.slice(0, 10) : missingDays
        }
      },
      details: {
        mpResults,
        missingVotesPreview: missingVotes.slice(0, 10),
        orphanedVotesPreview: orphanedVotes.slice(0, 10).map(v => ({
          id: v.id,
          mp_name: v.mp_name,
          vote_title: v.vote_title,
          vote_date: v.vote_date
        }))
      },
      recommendations: []
    };

    // Add recommendations
    if (missingVotes.length > 0) {
      result.recommendations.push(
        `⚠️ ${missingVotes.length} votes found in Parliament API but missing from database. Consider running backfill.`
      );
    }
    if (orphanedVotes.length > 0) {
      result.recommendations.push(
        `⚠️ ${orphanedVotes.length} votes in database have no associated story. Run orphaned votes processor.`
      );
    }
    if (!topic.parliamentary_last_collection_at) {
      result.recommendations.push(
        `⚠️ No last collection timestamp. Automation may not be running correctly.`
      );
    }
    if (result.validation.completeness < 90 && parliamentVotes.size > 0) {
      result.recommendations.push(
        `⚠️ Only ${result.validation.completeness}% completeness. Check automation status and extend collection window.`
      );
    }

    console.log('✅ Validation complete:', result.validation);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Validation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
