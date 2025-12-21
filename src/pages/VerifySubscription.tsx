import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, Mail, Trophy, Star } from 'lucide-react';

const SUBSCRIBER_EMAIL_KEY = 'subscriber_email';

export default function VerifySubscription() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'already_verified' | 'error'>('loading');
  const [topicInfo, setTopicInfo] = useState<{ name: string; slug: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token provided');
      return;
    }

    const verifySubscription = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-subscription', {
          body: { token }
        });

        if (error) {
          throw new Error(error.message);
        }

        if (data.success) {
          setTopicInfo({ name: data.topicName, slug: data.topicSlug });
          setStatus(data.alreadyVerified ? 'already_verified' : 'success');
          
          // Store email for subscriber perks
          if (data.email) {
            localStorage.setItem(SUBSCRIBER_EMAIL_KEY, data.email.toLowerCase());
          }
        } else {
          setStatus('error');
          setErrorMessage(data.error || 'Verification failed');
        }
      } catch (err) {
        console.error('Verification error:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed');
      }
    };

    verifySubscription();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <CardTitle className="mt-4">Verifying your subscription...</CardTitle>
            </>
          )}
          
          {status === 'success' && (
            <>
              <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
              <CardTitle className="mt-4 text-green-600">Subscription Confirmed!</CardTitle>
            </>
          )}
          
          {status === 'already_verified' && (
            <>
              <CheckCircle className="w-16 h-16 mx-auto text-blue-500" />
              <CardTitle className="mt-4 text-blue-600">Already Verified</CardTitle>
            </>
          )}
          
          {status === 'error' && (
            <>
              <XCircle className="w-16 h-16 mx-auto text-destructive" />
              <CardTitle className="mt-4 text-destructive">Verification Failed</CardTitle>
            </>
          )}
        </CardHeader>
        
        <CardContent className="text-center space-y-6">
          {status === 'success' && topicInfo && (
            <>
              <p className="text-muted-foreground">
                You're now subscribed to <strong>{topicInfo.name}</strong> briefings.
              </p>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold flex items-center justify-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  Subscriber Perks Unlocked!
                </h3>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-primary" />
                    Score tracking in Play Mode
                  </li>
                  <li className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    Access to leaderboards
                  </li>
                  <li className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    Exclusive content cards
                  </li>
                </ul>
              </div>
              
              <div className="flex flex-col gap-3">
                <Button onClick={() => navigate(`/play/${topicInfo.slug}`)}>
                  <Trophy className="w-4 h-4 mr-2" />
                  Try Play Mode
                </Button>
                <Button variant="outline" onClick={() => navigate(`/feed/${topicInfo.slug}`)}>
                  Visit Feed
                </Button>
              </div>
            </>
          )}
          
          {status === 'already_verified' && topicInfo && (
            <>
              <p className="text-muted-foreground">
                Your email is already verified for <strong>{topicInfo.name}</strong>.
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={() => navigate(`/play/${topicInfo.slug}`)}>
                  <Trophy className="w-4 h-4 mr-2" />
                  Play Mode
                </Button>
                <Button variant="outline" onClick={() => navigate(`/feed/${topicInfo.slug}`)}>
                  Visit Feed
                </Button>
              </div>
            </>
          )}
          
          {status === 'error' && (
            <>
              <p className="text-muted-foreground">
                {errorMessage || 'The verification link may be invalid or expired.'}
              </p>
              <Button variant="outline" onClick={() => navigate('/')}>
                Go Home
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
