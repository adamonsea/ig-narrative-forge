import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { Mail, Loader2 } from 'lucide-react';

export type SubscriptionFrequency = 'daily' | 'weekly' | 'both';

interface NewsletterSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
  topicId: string;
  defaultFrequency?: SubscriptionFrequency | undefined;
}

const frequencyLabels: Record<SubscriptionFrequency, string> = {
  daily: 'daily updates',
  weekly: 'weekly digest',
  both: 'daily updates and weekly digest',
};

const titleLabels: Record<SubscriptionFrequency, string> = {
  daily: 'Daily briefing',
  weekly: 'Weekly briefing',
  both: 'Daily and weekly briefings',
};

export const NewsletterSignupModal = ({ isOpen, onClose, topicName, topicId, defaultFrequency = 'weekly' }: NewsletterSignupModalProps) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [enablePushNotifications, setEnablePushNotifications] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { isSupported: isPushSupported, subscribeToPush } = usePushSubscription(topicId);
  const selectedFrequency = defaultFrequency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive"
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Email first: always saved through the sign-up service, whatever else is ticked
      const { data, error } = await supabase.functions.invoke('secure-newsletter-signup', {
        body: {
          email: email.trim(),
          name: name.trim() || undefined,
          topicId: topicId,
          notificationType: selectedFrequency,
        }
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        if (data.rateLimited) {
          toast({
            title: "Too many attempts",
            description: "Please wait before trying again. This helps prevent spam.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error",
            description: data.error,
            variant: "destructive"
          });
        }
        setIsSubmitting(false);
        return;
      }

      if (data?.alreadySubscribed) {
        toast({ title: "Already subscribed", description: "You're already subscribed to this feed." });
      } else if (data?.success) {
        toast({ title: "Check your email", description: data.message });
      }

      // Browser notifications are an extra: if they fail, the email sign-up still stands
      if (enablePushNotifications && isPushSupported) {
        await subscribeToPush(selectedFrequency === 'daily' ? 'daily' : 'weekly');
      }

      // Reset form and close
      setEmail('');
      setName('');
      setEnablePushNotifications(false);
      onClose();

    } catch (error) {
      console.error('Error signing up for newsletter:', error);
      toast({
        title: "Error",
        description: "Failed to subscribe. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
            {titleLabels[selectedFrequency]}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Subscribe to {frequencyLabels[selectedFrequency]} for {topicName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              aria-label="Email address"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-11 text-base"
              required
            />
          </div>

          <Input
            id="name"
            type="text"
            aria-label="First name"
            placeholder="First name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            className="h-11 text-base"
          />

          {isPushSupported && (
            <div className="flex items-center gap-3 py-2">
              <Checkbox
                id="push-notifications"
                checked={enablePushNotifications}
                onCheckedChange={(checked) => setEnablePushNotifications(checked as boolean)}
                disabled={isSubmitting}
              />
              <Label htmlFor="push-notifications" className="text-sm font-normal cursor-pointer">
                Get browser notifications
              </Label>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Subscribing...
                </>
              ) : (
                'Subscribe'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};