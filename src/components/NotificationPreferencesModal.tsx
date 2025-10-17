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
}

type NotificationType = 'instant' | 'daily' | 'weekly';

export const NotificationPreferencesModal = ({ 
  isOpen, 
  onClose, 
  topicName, 
  topicId 
}: NotificationPreferencesModalProps) => {
  const { toast } = useToast();
  const { isSupported, subscribeToPush } = usePushSubscription(topicId);
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
      // Use a temporary email format that includes the type
      // This will be replaced in Phase 1 when we update the hook
      const tempEmail = `${type}@notification.local`;
      const success = await subscribeToPush(tempEmail, type);
      
      if (success) {
        await refresh();
        
        const messages = {
          instant: "You'll get notified as soon as new stories are published",
          daily: "You'll receive a daily summary every evening at 6 PM",
          weekly: "You'll receive a weekly roundup every Friday at 10 AM"
        };
        
        toast({
          title: "Subscribed!",
          description: messages[type]
        });
      }
    } catch (error) {
      console.error('Error subscribing:', error);
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
      title: 'Daily Summary',
      description: 'One notification per day at 6 PM',
      color: 'text-blue-500'
    },
    {
      type: 'weekly' as NotificationType,
      icon: Mail,
      title: 'Weekly Roundup',
      description: 'Fridays at 10 AM with highlights',
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
            Get Notified
          </DialogTitle>
          <DialogDescription>
            Choose how often you want updates for <strong>{topicName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {notificationOptions.map((option) => {
            const Icon = option.icon;
            const isSubscribed = subscriptions[option.type];
            const isSubscribing = subscribingType === option.type;
            
            return (
              <button
                key={option.type}
                onClick={() => !isSubscribed && handleSubscribe(option.type)}
                disabled={isSubscribed || isSubscribing || checkingSubscriptions}
                className={`
                  w-full p-6 rounded-xl border transition-all text-left
                  ${isSubscribed 
                    ? 'bg-muted/50 border-border cursor-default' 
                    : 'bg-card border-border/50 hover:bg-muted/30 hover:border-border cursor-pointer'
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
                      {isSubscribed && (
                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <Check className="w-3 h-3" />
                          Subscribed
                        </div>
                      )}
                      {isSubscribing && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                </div>
              </button>
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
