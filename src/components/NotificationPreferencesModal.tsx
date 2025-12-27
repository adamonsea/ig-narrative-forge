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
import { useNotificationSubscriptions } from '@/hooks/useNotificationSubscriptions';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Calendar, Check, Loader2 } from 'lucide-react';

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
  const [subscribingType, setSubscribingType] = useState<NotificationType | null>(null);
  const [emailInput, setEmailInput] = useState('');
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
        variant: "destructive"
      });
      return;
    }

    setSubscribingType(type);

    try {
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
        setActiveInput(null);
        setEmailInput('');
        return;
      }

      const { error } = await supabase
        .from('topic_newsletter_signups')
        .insert({
          topic_id: topicId,
          email: emailInput.toLowerCase().trim(),
          notification_type: type,
          frequency: type,
          is_active: true
        });

      if (error) throw error;

      toast({
        title: "You're subscribed!",
        description: `${type === 'daily' ? 'Daily' : 'Weekly'} briefing will be sent to ${emailInput}`,
        duration: 5000,
      });

      setActiveInput(null);
      setEmailInput('');
      await refresh();
    } catch (error) {
      console.error('Error subscribing:', error);
      toast({
        title: "Error",
        description: "Failed to subscribe. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSubscribingType(null);
    }
  };

  const handleUnsubscribe = async (type: NotificationType) => {
    setSubscribingType(type);

    try {
      const { error } = await supabase
        .from('topic_newsletter_signups')
        .update({ is_active: false })
        .eq('topic_id', topicId)
        .eq('notification_type', type)
        .not('email', 'is', null);

      if (error) throw error;

      toast({
        title: "Unsubscribed",
        description: `You've unsubscribed from ${type} email updates`,
      });

      await refresh();
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
      description: 'Top stories delivered at 5 PM',
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
                            if (e.key === 'Escape') setActiveInput(null);
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

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can subscribe to both daily and weekly newsletters
        </p>
      </DialogContent>
    </Dialog>
  );
};
