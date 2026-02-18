import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase Edge Functions rewrite text/html GET responses to text/plain,
// so we redirect to the frontend app which renders the confirmation page.
const APP_BASE_URL = 'https://curatr.pro';

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  const redirect = (status: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${APP_BASE_URL}/unsubscribe?status=${status}` },
    });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!token || !uuidRegex.test(token)) {
    return redirect('invalid');
  }

  try {
    const { data: signup, error: lookupError } = await supabase
      .from('topic_newsletter_signups')
      .select('id, is_active, email, notification_type, topic_id')
      .eq('unsubscribe_token', token)
      .maybeSingle();

    if (lookupError) {
      console.error('Lookup error:', lookupError);
      return redirect('error');
    }

    if (!signup) {
      return redirect('not_found');
    }

    if (!signup.is_active) {
      return redirect('already');
    }

    const { error: updateError } = await supabase
      .from('topic_newsletter_signups')
      .update({ is_active: false })
      .eq('id', signup.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return redirect('error');
    }

    console.log(`✅ Unsubscribed ${signup.email} from ${signup.notification_type} (topic: ${signup.topic_id})`);
    return redirect('success');
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return redirect('error');
  }
});
