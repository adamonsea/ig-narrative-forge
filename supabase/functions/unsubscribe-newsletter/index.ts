import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  // Validate token format (must be a UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!token || !uuidRegex.test(token)) {
    return htmlResponse('Invalid Link', 'This unsubscribe link is invalid or has expired.', 400);
  }

  try {
    // Look up the subscription by token
    const { data: signup, error: lookupError } = await supabase
      .from('topic_newsletter_signups')
      .select('id, is_active, email, notification_type, topic_id')
      .eq('unsubscribe_token', token)
      .maybeSingle();

    if (lookupError) {
      console.error('Lookup error:', lookupError);
      return htmlResponse('Something went wrong', 'We couldn\'t process your request. Please try again later.', 500);
    }

    if (!signup) {
      return htmlResponse('Link Not Found', 'This unsubscribe link is no longer valid. You may have already unsubscribed.', 404);
    }

    if (!signup.is_active) {
      return htmlResponse('Already Unsubscribed', 'You\'ve already been unsubscribed from this briefing. No further action needed.', 200);
    }

    // Deactivate the subscription
    const { error: updateError } = await supabase
      .from('topic_newsletter_signups')
      .update({ is_active: false })
      .eq('id', signup.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return htmlResponse('Something went wrong', 'We couldn\'t unsubscribe you right now. Please try again later.', 500);
    }

    console.log(`✅ Unsubscribed ${signup.email} from ${signup.notification_type} (topic: ${signup.topic_id})`);

    return htmlResponse(
      'Unsubscribed',
      `You've been unsubscribed from ${signup.notification_type} briefing emails. You won't receive any more emails for this subscription.`,
      200
    );
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return htmlResponse('Something went wrong', 'An unexpected error occurred. Please try again later.', 500);
  }
});

function htmlResponse(title: string, message: string, status: number): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 420px; width: 90%; padding: 48px 32px; text-align: center; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 12px; }
    p { color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0; }
    .icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${status === 200 ? '✅' : '⚠️'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
