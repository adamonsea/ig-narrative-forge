import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NotificationPreferencesModal } from './NotificationPreferencesModal';
import { Bell, Sparkles } from 'lucide-react';

interface EndOfFeedCTAProps {
  topicName: string;
  topicId: string;
}

export const EndOfFeedCTA = ({ topicName, topicId }: EndOfFeedCTAProps) => {
  const [showSignupModal, setShowSignupModal] = useState(false);

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
              Stay in the loop with new updates as they happen.
            </p>
          </div>

          <div className="pt-2">
            <Button 
              onClick={() => setShowSignupModal(true)}
              size="lg"
              className="gap-2"
            >
              <Bell className="w-4 h-4" />
              Get Notified of New Content
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Be the first to know when fresh content drops
          </p>
        </div>
      </Card>

      <NotificationPreferencesModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        topicName={topicName}
        topicId={topicId}
        isFirstTimePrompt={false}
      />
    </>
  );
};