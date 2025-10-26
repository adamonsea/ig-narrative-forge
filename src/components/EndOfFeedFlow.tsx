import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NotificationPreferencesModal } from './NotificationPreferencesModal';
import { Bell, Sparkles, Plus, ArrowRight } from 'lucide-react';

interface EndOfFeedFlowProps {
  topicName: string;
  topicId: string;
  topicSlug: string;
  topicIcon?: string;
}

export const EndOfFeedFlow = ({ topicName, topicId, topicSlug, topicIcon }: EndOfFeedFlowProps) => {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [step, setStep] = useState<'intro' | 'homescreen' | 'notifications'>('intro');

  const handleAddToHomeScreen = () => {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
      // For iOS, show instructions
      alert(`To add ${topicName} to your home screen:\n\n1. Tap the Share button (⎙)\n2. Select "Add to Home Screen"\n3. Tap "Add"`);
    } else {
      // For Android/Desktop, trigger install prompt if available
      const deferredPrompt = (window as any).deferredPrompt;
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
          (window as any).deferredPrompt = null;
        });
      }
    }
    
    // Move to next step
    setStep('notifications');
  };

  const skipToNotifications = () => {
    setStep('notifications');
  };

  const openNotificationModal = () => {
    setShowNotificationModal(true);
  };

  if (step === 'intro') {
    return (
      <>
        <Card className="p-8 text-center bg-gradient-to-br from-background to-muted/30 border-dashed">
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-bold">You're all caught up!</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                You've reached the end of our latest <strong>{topicName}</strong> content.
              </p>
            </div>

            <div className="pt-2">
              <Button 
                onClick={() => setStep('homescreen')}
                size="lg"
                className="gap-2"
              >
                Stay Connected
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  if (step === 'homescreen') {
    return (
      <Card className="p-8 text-center bg-gradient-to-br from-background to-muted/30 border-dashed">
        <div className="space-y-4">
          {topicIcon && (
            <img
              src={topicIcon}
              alt={`${topicName} icon`}
              className="w-16 h-16 rounded-lg object-cover mx-auto"
            />
          )}
          
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Add to Home Screen?</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Get instant access to <strong>{topicName}</strong> with one tap from your home screen.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button 
              onClick={handleAddToHomeScreen}
              size="lg"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add to Home Screen
            </Button>
            <Button 
              variant="outline"
              onClick={skipToNotifications}
              size="lg"
            >
              Skip
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-8 text-center bg-gradient-to-br from-background to-muted/30 border-dashed">
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Bell className="w-8 h-8 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Never miss an update</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Choose how you'd like to stay informed about new <strong>{topicName}</strong> content.
            </p>
          </div>

          <div className="pt-2">
            <Button 
              onClick={openNotificationModal}
              size="lg"
              className="gap-2"
            >
              <Bell className="w-4 h-4" />
              Setup Notifications
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Instant, daily, or weekly - you choose
          </p>
        </div>
      </Card>

      <NotificationPreferencesModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        topicName={topicName}
        topicId={topicId}
        isFirstTimePrompt={true}
      />
    </>
  );
};
