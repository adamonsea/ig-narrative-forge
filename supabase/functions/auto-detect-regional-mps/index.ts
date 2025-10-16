import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REGIONAL_CONSTITUENCIES: Record<string, string[]> = {
  'Eastbourne': ['Eastbourne'],
  'Brighton': ['Brighton Kemptown', 'Brighton Pavilion', 'Hove'],
  'Lewes': ['Lewes'],
  'Hastings': ['Hastings and Rye'],
  'Bexhill': ['Bexhill and Battle'],
  'Worthing': ['East Worthing and Shoreham', 'Worthing West']
};

interface MPInfo {
  id: number;
  name: string;
  party: string;
  constituency: string;
}

async function fetchCurrentMpForConstituency(constituency: string): Promise<MPInfo | null> {
  const normalizedTarget = constituency.toLowerCase().trim();
  let skip = 0;
  const take = 20;
  let hasMore = true;

  while (hasMore) {
    const url = `https://members-api.parliament.uk/api/Members/Search?House=1&IsCurrentMember=true&skip=${skip}&take=${take}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Parliament API error: ${response.status}`);
    }

    const data = await response.json();
    const items = data.items || [];

    for (const member of items) {
      const latestMembership = member.value?.latestHouseMembership;
      
      if (latestMembership && !latestMembership.membershipEndDate) {
        const memberConstituency = latestMembership.membershipFrom.toLowerCase().trim();
        
        // Exact match
        if (memberConstituency === normalizedTarget) {
          return {
            id: member.value.id,
            name: member.value.nameDisplayAs || member.value.nameFullTitle,
            party: latestMembership.membershipFromName || 'Unknown',
            constituency: latestMembership.membershipFrom
          };
        }
      }
    }

    hasMore = items.length === take;
    skip += take;

    if (skip > 1000) break;
  }

  return null;
}

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
      throw new Error('Missing topicId or region');
    }

    console.log(`🔍 Auto-detecting MPs for region: ${region}`);

    const constituencies = REGIONAL_CONSTITUENCIES[region] || [region];
    const detectedMPs: MPInfo[] = [];
    const errors: string[] = [];

    for (const constituency of constituencies) {
      console.log(`Checking constituency: ${constituency}`);
      try {
        const mp = await fetchCurrentMpForConstituency(constituency);
        if (mp) {
          detectedMPs.push(mp);
          console.log(`✅ Found MP: ${mp.name} (${mp.party}) for ${mp.constituency}`);
        } else {
          console.log(`⚠️ No MP found for ${constituency}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching MP for ${constituency}:`, error);
        errors.push(`${constituency}: ${error.message}`);
      }
    }

    // Auto-insert detected MPs into topic_tracked_mps
    let insertedCount = 0;
    for (const mp of detectedMPs) {
      const { error } = await supabase
        .from('topic_tracked_mps')
        .upsert({
          topic_id: topicId,
          mp_id: mp.id,
          mp_name: mp.name,
          mp_party: mp.party,
          constituency: mp.constituency,
          is_auto_detected: true,
          is_primary: detectedMPs.length === 1, // Single MP = primary
          tracking_enabled: true,
          detection_confidence: 'high'
        }, {
          onConflict: 'topic_id,mp_id'
        });

      if (!error) {
        insertedCount++;
      } else {
        console.error(`❌ Failed to insert MP ${mp.name}:`, error);
      }
    }

    const confidence = detectedMPs.length > 0 ? 'high' : 'low';

    return new Response(
      JSON.stringify({
        success: true,
        detectedMPs,
        insertedCount,
        constituencies,
        confidence,
        errors: errors.length > 0 ? errors : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Auto-detection error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        detectedMPs: []
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
