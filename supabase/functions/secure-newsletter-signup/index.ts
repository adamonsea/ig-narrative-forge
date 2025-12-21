import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsletterSignupRequest {
  email: string;
  name?: string;
  topicId: string;
  notificationType?: 'daily' | 'weekly';
  clientIP?: string;
}

// Simple hash function for rate limiting
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
};

serve(async (req) => {
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

    const { email, name, topicId, notificationType = 'daily', clientIP }: NewsletterSignupRequest = await req.json();

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
      .select('id, name, slug, is_public, branding_config')
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

    // Check rate limits
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

    // Record the signup attempt
    await supabase.rpc('record_newsletter_signup_attempt', {
      p_email: email,
      p_ip_hash: ipHash
    });

    // Check if already subscribed to this notification type
    const { data: existingSignup } = await supabase
      .from('topic_newsletter_signups')
      .select('id, email_verified')
      .eq('topic_id', topicId)
      .eq('email', email.trim().toLowerCase())
      .eq('notification_type', notificationType)
      .single();

    if (existingSignup) {
      if (existingSignup.email_verified) {
        return new Response(
          JSON.stringify({ 
            message: 'Already subscribed to this briefing',
            alreadySubscribed: true 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Resend confirmation email
        const verificationToken = crypto.randomUUID();
        await supabase
          .from('topic_newsletter_signups')
          .update({ 
            verification_token: verificationToken,
            verification_sent_at: new Date().toISOString()
          })
          .eq('id', existingSignup.id);

        // Send confirmation email
        await sendConfirmationEmail(supabaseUrl, supabaseServiceKey, {
          signupId: existingSignup.id,
          email: email.trim().toLowerCase(),
          topicName: topic.name,
          topicSlug: topic.slug,
          topicLogoUrl: topic.branding_config?.logo_url,
          verificationToken,
          notificationType
        });

        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Confirmation email resent. Please check your inbox.',
            pendingVerification: true 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Generate verification token
    const verificationToken = crypto.randomUUID();

    // Insert the newsletter signup (NOT verified yet)
    const { data: signup, error: insertError } = await supabase
      .from('topic_newsletter_signups')
      .insert({
        topic_id: topicId,
        email: email.trim().toLowerCase(),
        name: name?.trim() || null,
        notification_type: notificationType,
        email_verified: false,
        is_active: false, // Will be activated upon verification
        verification_token: verificationToken,
        verification_sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ 
            message: 'Already subscribed to this briefing',
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

    // Send confirmation email
    await sendConfirmationEmail(supabaseUrl, supabaseServiceKey, {
      signupId: signup.id,
      email: email.trim().toLowerCase(),
      topicName: topic.name,
      topicSlug: topic.slug,
      topicLogoUrl: topic.branding_config?.logo_url,
      verificationToken,
      notificationType
    });

    // Log successful signup request
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Newsletter signup initiated - confirmation email sent',
        context: {
          topic_id: topicId,
          topic_name: topic.name,
          notification_type: notificationType,
          email_domain: email.split('@')[1],
          has_name: !!name
        },
        function_name: 'secure-newsletter-signup'
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Please check your email to confirm your ${topic.name} subscription!`,
        pendingVerification: true,
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

// Helper to send confirmation email
async function sendConfirmationEmail(
  supabaseUrl: string, 
  serviceKey: string, 
  data: {
    signupId: string;
    email: string;
    topicName: string;
    topicSlug: string;
    topicLogoUrl?: string;
    verificationToken: string;
    notificationType: 'daily' | 'weekly';
  }
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-confirmation-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send confirmation email:', errorText);
    }
  } catch (error) {
    console.error('Error calling send-confirmation-email:', error);
  }
}