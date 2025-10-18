import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Bell, Zap, Calendar, Mail, Check, Loader2 } from 'lucide-react';

interface NotificationPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
  topicId: string;
  isFirstTimePrompt?: boolean; // Flag to show special messaging for new users
}

type NotificationType = 'instant' | 'daily' | 'weekly';

export const NotificationPreferencesModal = ({ 
  isOpen, 
  onClose, 
  topicName, 
  topicId,
  isFirstTimePrompt = false
}: NotificationPreferencesModalProps) => {
  const { toast } = useToast();
  const { isSupported, subscribeToPush, unsubscribe } = usePushSubscription(topicId);
  const { subscriptions, isLoading: checkingSubscriptions, refresh } = useNotificationSubscriptions(topicId);
  const [subscribingType, setSubscribingType] = useState<NotificationType | null>(null);

  const handleSubscribe = async (type: NotificationType) => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in your browser",
        variant: "destructive"
      });
      return;
    }

    setSubscribingType(type);

    try {
      const success = await subscribeToPush(type);
      
      if (success) {
        await refresh();
      }
    } catch (error) {
      console.error('Error subscribing:', error);
    } finally {
      setSubscribingType(null);
    }
  };

  const handleUnsubscribe = async (type: NotificationType) => {
    setSubscribingType(type);

    try {
      const success = await unsubscribe(type);
      
      if (success) {
        await refresh();
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
    } finally {
      setSubscribingType(null);
    }
  };

  const notificationOptions = [
    {
      type: 'instant' as NotificationType,
      icon: Zap,
      title: 'Every Story',
      description: 'Get notified as stories publish',
      color: 'text-yellow-500'
    },
    {
      type: 'daily' as NotificationType,
      icon: Calendar,
      title: 'Daily Roundup',
      description: 'One notification per day at 8 PM',
      color: 'text-blue-500'
    },
    {
      type: 'weekly' as NotificationType,
      icon: Mail,
      title: 'Weekly Summary',
      description: 'Sunday mornings at 9 AM',
      color: 'text-purple-500'
    }
  ];

  if (!isSupported) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Browser Notifications
            </DialogTitle>
            <DialogDescription>
              Push notifications are not supported in your browser. Try using Chrome, Firefox, or Safari.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
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

        <div className="space-y-3 mt-4">
          {notificationOptions.map((option) => {
            const Icon = option.icon;
            const isSubscribed = subscriptions[option.type];
            const isSubscribing = subscribingType === option.type;
            
            return (
              <div
                key={option.type}
                className={`
                  w-full p-6 rounded-xl border transition-all
                  ${isSubscribed 
                    ? 'bg-muted/50 border-border' 
                    : 'bg-card border-border/50'
                  }
                  ${isSubscribing ? 'opacity-50' : ''}
                `}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg bg-muted ${option.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-base">{option.title}</h3>
                      {isSubscribed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnsubscribe(option.type)}
                          disabled={isSubscribing || checkingSubscriptions}
                          className="text-xs h-7"
                        >
                          {isSubscribing ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <Check className="w-3 h-3 mr-1 text-green-600 dark:text-green-400" />
                          )}
                          Unsubscribe
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleSubscribe(option.type)}
                          disabled={isSubscribing || checkingSubscriptions}
                          className="text-xs h-7"
                        >
                          {isSubscribing && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                          Subscribe
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can subscribe to multiple notification types
        </p>
      </DialogContent>
    </Dialog>
  );
};
