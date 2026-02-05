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
import { Mail, Bell, Loader2 } from 'lucide-react';

export type SubscriptionFrequency = 'daily' | 'weekly' | 'both';

interface NewsletterSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
  topicId: string;
  defaultFrequency?: SubscriptionFrequency;
}

const frequencyLabels: Record<SubscriptionFrequency, string> = {
  daily: 'daily updates',
  weekly: 'weekly digest',
  both: 'daily updates and weekly digest',
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
      // Handle push notification subscription first if enabled
      if (enablePushNotifications && isPushSupported) {
        const pushSuccess = await subscribeToPush('weekly');
        if (!pushSuccess) {
          setIsSubmitting(false);
          return;
        }
      } else {
        // Regular email-only signup
        let clientIP: string | undefined;
        try {
          const ipResponse = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipResponse.json();
          clientIP = ipData.ip;
        } catch {
          clientIP = undefined;
        }

        const { data, error } = await supabase.functions.invoke('secure-newsletter-signup', {
          body: {
            email: email.trim(),
            name: name.trim() || undefined,
            topicId: topicId,
            clientIP: clientIP
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
          } else if (data.alreadySubscribed) {
            toast({
              title: "Already subscribed",
              description: "You're already subscribed to notifications for this topic!",
              variant: "default"
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
        } else if (data?.success) {
          toast({
            title: "Subscribed successfully!",
            description: data.message,
            variant: "default"
          });
        }
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
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Stay Updated
          </DialogTitle>
          <DialogDescription>
            Subscribe to {frequencyLabels[selectedFrequency]} for <strong>{topicName}</strong>
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">First name (optional)</Label>
            <Input
              id="name"
              type="text"
              placeholder="First name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {isPushSupported && (
            <div className="flex items-start space-x-3 rounded-lg border border-border/50 bg-muted/30 p-4">
              <Checkbox
                id="push-notifications"
                checked={enablePushNotifications}
                onCheckedChange={(checked) => setEnablePushNotifications(checked as boolean)}
                disabled={isSubmitting}
              />
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor="push-notifications"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    Get browser notifications
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receive weekly updates even when offline. Works on desktop and mobile.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
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