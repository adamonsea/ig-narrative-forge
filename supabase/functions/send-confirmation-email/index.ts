import React from 'npm:react@18.3.1'
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { ConfirmationEmail } from './_templates/confirmation.tsx';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = 'https://curatr.pro';

interface SendConfirmationRequest {
  signupId: string;
  email: string;
  topicName: string;
  topicSlug: string;
  topicLogoUrl?: string;
  verificationToken: string;
  notificationType: 'daily' | 'weekly';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { 
      signupId, 
      email, 
      topicName, 
      topicSlug, 
      topicLogoUrl, 
      verificationToken,
      notificationType 
    }: SendConfirmationRequest = await req.json();

    console.log(`📧 Sending confirmation email to ${email} for ${topicName}`);

    if (!resendApiKey) {
      console.warn('⚠️ RESEND_API_KEY not configured');
      return new Response(JSON.stringify({
        success: false,
        error: 'Email sending not configured'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);

    // Build verification URL
    const verificationUrl = `${BASE_URL}/verify-subscription?token=${verificationToken}`;

    // Generate email HTML
    const emailHtml = await renderAsync(
      React.createElement(ConfirmationEmail, {
        topicName,
        topicSlug,
        topicLogoUrl,
        verificationUrl,
        notificationType,
        baseUrl: BASE_URL
      })
    );

    const subject = `Confirm your ${topicName} ${notificationType} briefing subscription`;

    const { data, error: sendError } = await resend.emails.send({
      from: `${topicName} <noreply@curatr.pro>`,
      to: [email],
      subject,
      html: emailHtml,
    });

    if (sendError) {
      console.error('Failed to send confirmation email:', sendError);
      throw new Error(`Email send failed: ${sendError.message}`);
    }

    // Update signup record to mark email as sent
    await supabase
      .from('topic_newsletter_signups')
      .update({ verification_sent_at: new Date().toISOString() })
      .eq('id', signupId);

    console.log(`✅ Confirmation email sent to ${email}`);

    // Log the operation
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Confirmation email sent for ${topicName}`,
        context: {
          signup_id: signupId,
          topic_name: topicName,
          notification_type: notificationType,
          email_domain: email.split('@')[1]
        },
        function_name: 'send-confirmation-email'
      });

    return new Response(JSON.stringify({
      success: true,
      message: 'Confirmation email sent'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Confirmation email error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
