import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MPInfo {
  id: number;
  name: string;
  party: string;
  constituency: string;
}

// Cache for 24 hours
const MP_CACHE_TTL = 24 * 60 * 60 * 1000;
let cachedMPs: { mps: MPInfo[], lastFetch: number } | null = null;

async function fetchAllCurrentMPs(): Promise<MPInfo[]> {
  // Check cache first
  if (cachedMPs && Date.now() - cachedMPs.lastFetch < MP_CACHE_TTL) {
    console.log(`📦 Returning ${cachedMPs.mps.length} cached MPs`);
    return cachedMPs.mps;
  }

  console.log('🔄 Fetching fresh MP data from Parliament API...');
  const allMPs: MPInfo[] = [];
  let skip = 0;
  const take = 20;
  let hasMore = true;

  while (hasMore) {
    const url = `https://members-api.parliament.uk/api/Members/Search?House=1&IsCurrentMember=true&skip=${skip}&take=${take}`;
    console.log(`Fetching MPs: skip=${skip}, take=${take}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Parliament API error: ${response.status}`);
    }

    const data = await response.json();
    const items = data.items || [];
    
    for (const member of items) {
      const latestMembership = member.value?.latestHouseMembership;
      
      if (latestMembership && !latestMembership.membershipEndDate) {
        allMPs.push({
          id: member.value.id,
          name: member.value.nameDisplayAs || member.value.nameFullTitle,
          party: latestMembership.membershipFromName || 'Unknown',
          constituency: latestMembership.membershipFrom || 'Unknown'
        });
      }
    }

    hasMore = items.length === take;
    skip += take;

    // Safety limit
    if (skip > 1000) break;
  }

  console.log(`✅ Fetched ${allMPs.length} current MPs`);
  
  // Update cache
  cachedMPs = {
    mps: allMPs,
    lastFetch: Date.now()
  };

  return allMPs;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchTerm } = await req.json().catch(() => ({}));
    
    let mps = await fetchAllCurrentMPs();
    
    // Apply search filter if provided
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      mps = mps.filter(mp => 
        mp.name.toLowerCase().includes(term) ||
        mp.constituency.toLowerCase().includes(term) ||
        mp.party.toLowerCase().includes(term)
      );
      console.log(`🔍 Filtered to ${mps.length} MPs matching "${searchTerm}"`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mps: mps.sort((a, b) => a.name.localeCompare(b.name)),
        totalCount: mps.length,
        lastUpdated: cachedMPs?.lastFetch ? new Date(cachedMPs.lastFetch).toISOString() : new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Error fetching MPs:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        mps: [],
        totalCount: 0
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
