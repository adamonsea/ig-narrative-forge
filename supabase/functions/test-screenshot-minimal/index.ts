import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🧪 Minimal screenshot test function called');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('📝 Request body received:', JSON.stringify(body, null, 2));
    
    // Check environment variables
    const screenshotToken = Deno.env.get('SCREENSHOTAPI_TOKEN');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('🔧 Environment check:', {
      screenshotToken: screenshotToken ? 'Present' : 'Missing',
      openaiKey: openaiKey ? 'Present' : 'Missing', 
      supabaseUrl: supabaseUrl ? 'Present' : 'Missing',
      supabaseKey: supabaseKey ? 'Present' : 'Missing'
    });

    const result = {
      success: true,
      message: 'Minimal test function working',
      timestamp: new Date().toISOString(),
      environment: {
        screenshotToken: !!screenshotToken,
        openaiKey: !!openaiKey,
        supabaseUrl: !!supabaseUrl,
        supabaseKey: !!supabaseKey
      },
      requestData: body
    };

    console.log('✅ Test successful:', result);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('❌ Minimal test failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});