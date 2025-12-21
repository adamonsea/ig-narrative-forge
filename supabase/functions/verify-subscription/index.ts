import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Verification token is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔐 Verifying subscription token: ${token.substring(0, 8)}...`);

    // Find the signup with this token
    const { data: signup, error: findError } = await supabase
      .from('topic_newsletter_signups')
      .select('id, email, topic_id, email_verified, notification_type, topics!inner(name, slug)')
      .eq('verification_token', token)
      .single();

    if (findError || !signup) {
      console.error('Token not found:', findError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid or expired verification token'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already verified
    if (signup.email_verified) {
      return new Response(JSON.stringify({
        success: true,
        alreadyVerified: true,
        message: 'Email already verified',
        topicName: (signup as any).topics?.name,
        topicSlug: (signup as any).topics?.slug
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the subscription
    const { error: updateError } = await supabase
      .from('topic_newsletter_signups')
      .update({
        email_verified: true,
        verified_at: new Date().toISOString(),
        is_active: true
      })
      .eq('id', signup.id);

    if (updateError) {
      console.error('Failed to verify:', updateError);
      throw new Error('Failed to verify subscription');
    }

    console.log(`✅ Subscription verified for ${signup.email}`);

    // Log the verification
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Newsletter subscription verified',
        context: {
          signup_id: signup.id,
          topic_id: signup.topic_id,
          topic_name: (signup as any).topics?.name,
          notification_type: signup.notification_type
        },
        function_name: 'verify-subscription'
      });

    return new Response(JSON.stringify({
      success: true,
      message: 'Subscription verified successfully',
      topicName: (signup as any).topics?.name,
      topicSlug: (signup as any).topics?.slug,
      email: signup.email
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Verification error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
