import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useNotificationSubscriptions, saveSubscriptionStatus } from '@/hooks/useNotificationSubscriptions';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Calendar, Check, Loader2, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useReducedMotion, setReduceAnimations } from '@/hooks/useReducedMotion';

interface NotificationPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
  topicId: string;
  isFirstTimePrompt?: boolean;
}

type NotificationType = 'daily' | 'weekly';

export const NotificationPreferencesModal = ({ 
  isOpen, 
  onClose, 
  topicName, 
  topicId,
  isFirstTimePrompt = false
}: NotificationPreferencesModalProps) => {
  const { toast } = useToast();
  const { emailSubscriptions, isLoading: checkingSubscriptions, refresh } = useNotificationSubscriptions(topicId, isOpen);
  const reducedMotion = useReducedMotion();
  const [subscribingType, setSubscribingType] = useState<NotificationType | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [activeInput, setActiveInput] = useState<NotificationType | null>(null);

  const handleSubscribe = async (type: NotificationType) => {
    if (!emailInput.trim()) {
      setActiveInput(type);
      return;
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(emailInput)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setSubscribingType(type);

    try {
      const { data, error, response } = await supabase.functions.invoke('secure-newsletter-signup', {
        body: {
          email: emailInput.toLowerCase().trim(),
          name: nameInput.trim() || undefined,
          topicId,
          notificationType: type,
        },
      });

      if (error) {
        let description = error.message || 'Failed to subscribe. Please try again.';

        // Best-effort parse of function error body (e.g. { error: "..." })
        try {
          if (response) {
            const contentType = response.headers.get('Content-Type') || '';
            if (contentType.includes('application/json')) {
              const body = await response.json();
              description = body?.error || body?.message || description;
            } else {
              const text = await response.text();
              if (text) description = text;
            }
          }
        } catch {
          // ignore parsing errors
        }

        toast({
          title: "Error",
          description,
          variant: "destructive",
        });
        return;
      }

      if (data?.alreadySubscribed) {
        toast({
          title: "Already subscribed",
          description: `This email is already subscribed to ${type} updates.`,
        });
      } else {
        // Save subscription status to localStorage for this browser
        saveSubscriptionStatus(topicId, type, true);
        
        toast({
          title: "Check your email",
          description:
            data?.message || `We sent a confirmation link to ${emailInput}. Please confirm to start receiving updates.`,
          duration: 7000,
        });
      }

      setActiveInput(null);
      setEmailInput('');
      setNameInput('');
      await refresh();
    } catch (err) {
      console.error('Error subscribing:', err);
      toast({
        title: "Error",
        description: "Failed to subscribe. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubscribingType(null);
    }
  };

  const handleUnsubscribe = async (type: NotificationType) => {
    setSubscribingType(type);

    try {
      // Update localStorage immediately for UI responsiveness
      saveSubscriptionStatus(topicId, type, false);
      
      // Try to update the database (may fail due to RLS for non-owners)
      await supabase
        .from('topic_newsletter_signups')
        .update({ is_active: false })
        .eq('topic_id', topicId)
        .eq('notification_type', type)
        .not('email', 'is', null);

      toast({
        title: "Unsubscribed",
        description: `You've unsubscribed from ${type} email updates`,
      });

      refresh();
    } catch (error) {
      console.error('Error unsubscribing:', error);
    } finally {
      setSubscribingType(null);
    }
  };

  const newsletterOptions = [
    {
      type: 'daily' as NotificationType,
      icon: Calendar,
      title: 'Daily Briefing',
      description: 'Top stories delivered at 9 AM',
      color: 'text-blue-500'
    },
    {
      type: 'weekly' as NotificationType,
      icon: Mail,
      title: 'Weekly Briefing',
      description: 'Top stories every Sunday at 9 AM',
      color: 'text-purple-500'
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            {isFirstTimePrompt ? "Stay in the loop?" : "Email Newsletter"}
          </DialogTitle>
          <DialogDescription>
            {isFirstTimePrompt 
              ? `Get the best ${topicName} stories delivered to your inbox`
              : `Subscribe to ${topicName} email updates`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {newsletterOptions.map((option) => {
            const Icon = option.icon;
            const isSubscribed = emailSubscriptions[option.type];
            const isProcessing = subscribingType === option.type;
            
            return (
              <div
                key={option.type}
                className={`
                  w-full p-4 rounded-xl border transition-all
                  ${isSubscribed ? 'bg-muted/50 border-primary/30' : 'bg-card border-border/50'}
                  ${isProcessing ? 'opacity-50' : ''}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${option.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-base">{option.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {option.description}
                    </p>

                    {isSubscribed ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnsubscribe(option.type)}
                        disabled={isProcessing || checkingSubscriptions}
                        className="text-xs h-8"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Check className="w-3 h-3 mr-1 text-green-600" />
                        )}
                        Subscribed
                      </Button>
                    ) : activeInput === option.type ? (
                      <div className="space-y-2">
                        <Input
                          type="text"
                          placeholder="First name (optional)"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            className="h-8 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSubscribe(option.type);
                              if (e.key === 'Escape') {
                                setActiveInput(null);
                                setNameInput('');
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSubscribe(option.type)}
                            disabled={!emailInput.trim() || isProcessing}
                            className="h-8"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Subscribe'
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setActiveInput(option.type)}
                        disabled={checkingSubscriptions}
                        className="text-xs h-8"
                      >
                        <Mail className="w-3 h-3 mr-1" />
                        Subscribe
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reduce animations toggle */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Reduce animations</span>
          </div>
          <Switch
            checked={reducedMotion}
            onCheckedChange={(checked) => setReduceAnimations(checked)}
          />
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can subscribe to both daily and weekly newsletters
        </p>
      </DialogContent>
    </Dialog>
  );
};
