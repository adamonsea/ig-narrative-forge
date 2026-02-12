import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mail, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { saveSubscriptionStatus } from '@/hooks/useNotificationSubscriptions';
import { useToast } from '@/hooks/use-toast';

interface InlineEmailSignupCardProps {
  topicId: string;
  topicName: string;
  topicSlug: string;
  topicLogoUrl?: string;
}

export const InlineEmailSignupCard = ({
  topicId,
  topicName,
  topicSlug,
  topicLogoUrl,
}: InlineEmailSignupCardProps) => {
  const { toast } = useToast();
  const storageKey = `email_briefing_subscribed_${topicId}`;

  const [isSubscribed, setIsSubscribed] = useState(
    () => localStorage.getItem(storageKey) === 'true'
  );
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSubmitting) return;

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      toast({ title: 'Invalid email', description: 'Please enter a valid email address.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('secure-newsletter-signup', {
        body: {
          email: email.trim(),
          topicId,
          notificationType: 'daily',
        },
      });

      if (error) throw error;

      // Mark as subscribed in localStorage
      localStorage.setItem(storageKey, 'true');
      saveSubscriptionStatus(topicId, 'daily', true);
      setIsSubscribed(true);

      toast({
        title: data?.pendingVerification ? 'Check your inbox!' : 'Subscribed!',
        description: data?.message || `You're signed up for the ${topicName} briefing.`,
      });
    } catch (err) {
      console.error('Email signup error:', err);
      toast({ title: 'Something went wrong', description: 'Please try again later.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [email, isSubmitting, topicId, topicName, storageKey, toast]);

  // Don't render if already subscribed
  if (isSubscribed) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-2 py-3 px-4">
          <Check className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-primary font-medium">You're subscribed to the {topicName} briefing</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex items-center gap-2">
          {topicLogoUrl ? (
            <img src={topicLogoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <Mail className="h-5 w-5 text-primary" />
          )}
          <h3 className="font-semibold text-sm">Get the {topicName} briefing</h3>
        </div>
        <p className="text-xs text-muted-foreground">Daily or weekly — straight to your inbox</p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 text-sm flex-1"
            required
            disabled={isSubmitting}
          />
          <Button type="submit" size="sm" className="h-9 shrink-0" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
