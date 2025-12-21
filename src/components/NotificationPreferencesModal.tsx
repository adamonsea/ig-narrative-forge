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
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { useNotificationSubscriptions } from '@/hooks/useNotificationSubscriptions';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Zap, Calendar, Mail, Check, Loader2, Send } from 'lucide-react';

interface NotificationPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
  topicId: string;
  isFirstTimePrompt?: boolean;
}

type NotificationType = 'instant' | 'daily' | 'weekly';
type SubscriptionMode = 'push' | 'email';

export const NotificationPreferencesModal = ({ 
  isOpen, 
  onClose, 
  topicName, 
  topicId,
  isFirstTimePrompt = false
}: NotificationPreferencesModalProps) => {
  const { toast } = useToast();
  const { isSupported, subscribeToPush, unsubscribe } = usePushSubscription(topicId);
  const { subscriptions, emailSubscriptions, isLoading: checkingSubscriptions, refresh } = useNotificationSubscriptions(topicId);
  const [subscribingType, setSubscribingType] = useState<NotificationType | null>(null);
  const [subscribingMode, setSubscribingMode] = useState<SubscriptionMode | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [showEmailInput, setShowEmailInput] = useState<NotificationType | null>(null);

  const handleSubscribePush = async (type: NotificationType) => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in your browser",
        variant: "destructive"
      });
      return;
    }

    setSubscribingType(type);
    setSubscribingMode('push');

    try {
      const success = await subscribeToPush(type);
      
      if (success) {
        await refresh();
      }
    } catch (error) {
      console.error('Error subscribing:', error);
    } finally {
      setSubscribingType(null);
      setSubscribingMode(null);
    }
  };

  const handleUnsubscribePush = async (type: NotificationType) => {
    setSubscribingType(type);
    setSubscribingMode('push');

    try {
      const success = await unsubscribe(type);
      
      if (success) {
        await refresh();
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
    } finally {
      setSubscribingType(null);
      setSubscribingMode(null);
    }
  };

  const handleSubscribeEmail = async (type: NotificationType) => {
    if (!emailInput.trim()) {
      setShowEmailInput(type);
      return;
    }

    // Validate email
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(emailInput)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive"
      });
      return;
    }

    setSubscribingType(type);
    setSubscribingMode('email');

    try {
      // Check if already subscribed with this email
      const { data: existing } = await supabase
        .from('topic_newsletter_signups')
        .select('id')
        .eq('topic_id', topicId)
        .eq('email', emailInput.toLowerCase())
        .eq('notification_type', type)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Already Subscribed",
          description: `This email is already subscribed to ${type} updates`,
        });
        setShowEmailInput(null);
        setEmailInput('');
        return;
      }

      // Create email subscription
      const { error } = await supabase
        .from('topic_newsletter_signups')
        .insert({
          topic_id: topicId,
          email: emailInput.toLowerCase().trim(),
          notification_type: type,
          frequency: type,
          is_active: true
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Subscribed!",
        description: `You'll receive ${type} email updates for ${topicName}`,
      });

      setShowEmailInput(null);
      setEmailInput('');
      await refresh();
    } catch (error) {
      console.error('Error subscribing to email:', error);
      toast({
        title: "Error",
        description: "Failed to subscribe. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSubscribingType(null);
      setSubscribingMode(null);
    }
  };

  const handleUnsubscribeEmail = async (type: NotificationType) => {
    setSubscribingType(type);
    setSubscribingMode('email');

    try {
      // Mark all email subscriptions for this type as inactive
      const { error } = await supabase
        .from('topic_newsletter_signups')
        .update({ is_active: false })
        .eq('topic_id', topicId)
        .eq('notification_type', type)
        .is('push_subscription', null)
        .not('email', 'is', null);

      if (error) throw error;

      toast({
        title: "Unsubscribed",
        description: `You've unsubscribed from ${type} email updates`,
      });

      await refresh();
    } catch (error) {
      console.error('Error unsubscribing from email:', error);
    } finally {
      setSubscribingType(null);
      setSubscribingMode(null);
    }
  };

  const notificationOptions = [
    {
      type: 'instant' as NotificationType,
      icon: Zap,
      title: 'Every Story',
      description: 'Get notified as stories publish',
      color: 'text-yellow-500',
      emailAvailable: false // Instant emails would be too many
    },
    {
      type: 'daily' as NotificationType,
      icon: Calendar,
      title: 'Daily Briefing',
      description: 'Daily digest at 5 PM',
      color: 'text-blue-500',
      emailAvailable: true
    },
    {
      type: 'weekly' as NotificationType,
      icon: Mail,
      title: 'Weekly Briefing',
      description: 'Sunday mornings at 9 AM',
      color: 'text-purple-500',
      emailAvailable: true
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            {isFirstTimePrompt ? "Stay in the loop?" : "Get Notified"}
          </DialogTitle>
          <DialogDescription>
            {isFirstTimePrompt 
              ? `You've been reading ${topicName} stories. Want to stay updated with new content?`
              : `Choose how often you want updates for ${topicName}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {notificationOptions.map((option) => {
            const Icon = option.icon;
            const isPushSubscribed = subscriptions[option.type];
            const isEmailSubscribed = emailSubscriptions[option.type];
            const isProcessing = subscribingType === option.type;
            
            return (
              <div
                key={option.type}
                className={`
                  w-full p-4 rounded-xl border transition-all
                  ${(isPushSubscribed || isEmailSubscribed) 
                    ? 'bg-muted/50 border-primary/30' 
                    : 'bg-card border-border/50'
                  }
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

                    {/* Subscription buttons */}
                    <div className="flex flex-wrap gap-2">
                      {/* Push notification button */}
                      {isSupported && (
                        isPushSubscribed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnsubscribePush(option.type)}
                            disabled={isProcessing || checkingSubscriptions}
                            className="text-xs h-8"
                          >
                            {isProcessing && subscribingMode === 'push' ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3 h-3 mr-1 text-green-600" />
                            )}
                            Push On
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSubscribePush(option.type)}
                            disabled={isProcessing || checkingSubscriptions}
                            className="text-xs h-8"
                          >
                            {isProcessing && subscribingMode === 'push' && (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            )}
                            <Bell className="w-3 h-3 mr-1" />
                            Push
                          </Button>
                        )
                      )}

                      {/* Email button - only for daily/weekly */}
                      {option.emailAvailable && (
                        isEmailSubscribed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnsubscribeEmail(option.type)}
                            disabled={isProcessing || checkingSubscriptions}
                            className="text-xs h-8"
                          >
                            {isProcessing && subscribingMode === 'email' ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3 h-3 mr-1 text-green-600" />
                            )}
                            Email On
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setShowEmailInput(showEmailInput === option.type ? null : option.type)}
                            disabled={isProcessing || checkingSubscriptions}
                            className="text-xs h-8"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Email
                          </Button>
                        )
                      )}
                    </div>

                    {/* Email input field */}
                    {showEmailInput === option.type && (
                      <div className="mt-3 flex gap-2">
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSubscribeEmail(option.type);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSubscribeEmail(option.type)}
                          disabled={!emailInput.trim() || isProcessing}
                          className="h-8"
                        >
                          {isProcessing && subscribingMode === 'email' ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'Subscribe'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!isSupported && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Push notifications not supported in your browser. Use email instead.
          </p>
        )}

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can subscribe to multiple notification types
        </p>
      </DialogContent>
    </Dialog>
  );
};
