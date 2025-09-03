import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsletterSignupRequest {
  email: string;
  name?: string;
  topicId: string;
  clientIP?: string; // Will be provided by the client for rate limiting
}

// Simple hash function for rate limiting (doesn't need to be cryptographically secure)
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, name, topicId, clientIP }: NewsletterSignupRequest = await req.json();

    // Validate input
    if (!email || !topicId) {
      return new Response(
        JSON.stringify({ error: 'Email and topicId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if topic exists and is public
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, is_public')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      return new Response(
        JSON.stringify({ error: 'Topic not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!topic.is_public) {
      return new Response(
        JSON.stringify({ error: 'Topic is not available for public signups' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limits using the database functions
    const ipHash = clientIP ? simpleHash(clientIP) : null;
    
    const { data: rateLimitCheck, error: rateLimitError } = await supabase
      .rpc('check_newsletter_signup_rate_limit', {
        p_email: email,
        p_ip_hash: ipHash
      });

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
      return new Response(
        JSON.stringify({ error: 'Rate limit check failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          rateLimited: true 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record the signup attempt for rate limiting
    const { error: recordError } = await supabase
      .rpc('record_newsletter_signup_attempt', {
        p_email: email,
        p_ip_hash: ipHash
      });

    if (recordError) {
      console.warn('Failed to record signup attempt:', recordError);
      // Continue anyway, don't block the signup
    }

    // Check if already subscribed
    const { data: existingSignup } = await supabase
      .from('topic_newsletter_signups')
      .select('id')
      .eq('topic_id', topicId)
      .eq('email', email)
      .single();

    if (existingSignup) {
      return new Response(
        JSON.stringify({ 
          message: 'Already subscribed to this topic',
          alreadySubscribed: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate verification token for future email verification
    const verificationToken = crypto.randomUUID();

    // Insert the newsletter signup
    const { data: signup, error: insertError } = await supabase
      .from('topic_newsletter_signups')
      .insert({
        topic_id: topicId,
        email: email.trim().toLowerCase(),
        name: name?.trim() || null,
        email_verified: false, // Will be verified via email later
        verification_token: verificationToken,
        verification_sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      
      // Handle constraint violations specifically
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ 
            message: 'Already subscribed to this topic',
            alreadySubscribed: true 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to subscribe' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log successful signup
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Newsletter signup completed',
        context: {
          topic_id: topicId,
          topic_name: topic.name,
          email_domain: email.split('@')[1],
          has_name: !!name
        },
        function_name: 'secure-newsletter-signup'
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Successfully subscribed to ${topic.name} updates!`,
        signup_id: signup.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Newsletter signup error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});