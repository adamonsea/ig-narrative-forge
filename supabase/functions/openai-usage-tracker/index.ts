import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const { startDate, endDate } = await req.json();
    
    // Default to last 7 days if not specified
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    console.log(`📊 Querying OpenAI usage from ${start} to ${end}`);

    // Query OpenAI Usage API
    const response = await fetch(
      `https://api.openai.com/v1/usage?start_date=${start}&end_date=${end}`,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Usage API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const usageData = await response.json();
    console.log('✅ OpenAI usage data retrieved');

    // Process and categorize the data
    const imageUsage = usageData.data?.filter((item: any) => 
      item.snapshot_id?.includes('image') || 
      item.operation?.includes('image') ||
      item.model?.includes('image')
    ) || [];

    const textUsage = usageData.data?.filter((item: any) => 
      !item.snapshot_id?.includes('image') && 
      !item.operation?.includes('image') &&
      !item.model?.includes('image')
    ) || [];

    // Calculate totals
    const totalImageCost = imageUsage.reduce((sum: number, item: any) => 
      sum + (item.cost || 0), 0
    );

    const totalTextCost = textUsage.reduce((sum: number, item: any) => 
      sum + (item.cost || 0), 0
    );

    const summary = {
      dateRange: { start, end },
      images: {
        requests: imageUsage.length,
        totalCost: totalImageCost,
        avgCostPerImage: imageUsage.length > 0 ? totalImageCost / imageUsage.length : 0,
        details: imageUsage.map((item: any) => ({
          timestamp: item.timestamp,
          model: item.model || item.snapshot_id,
          cost: item.cost,
          parameters: item.metadata || {}
        }))
      },
      text: {
        requests: textUsage.length,
        totalCost: totalTextCost,
        avgCostPerRequest: textUsage.length > 0 ? totalTextCost / textUsage.length : 0
      },
      totalCost: totalImageCost + totalTextCost
    };

    return new Response(
      JSON.stringify(summary, null, 2),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in openai-usage-tracker:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
