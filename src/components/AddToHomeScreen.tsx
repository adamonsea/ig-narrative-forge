import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface AddToHomeScreenProps {
  topicName: string;
  topicLogo?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const AddToHomeScreen = ({ topicName, topicLogo }: AddToHomeScreenProps) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    // Check if iOS
    const isIOSDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Check if already dismissed
    const dismissed = localStorage.getItem('a2hs-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Listen for the beforeinstallprompt event (Android/Desktop)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after 3 seconds
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, show manual instructions after 3 seconds
    if (isIOSDevice) {
      setTimeout(() => setShowPrompt(true), 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('a2hs-dismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <Card className="fixed bottom-4 left-4 right-4 z-50 p-4 shadow-lg border-2 mx-auto max-w-md bg-background">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 hover:bg-accent rounded-full transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 items-start">
        {topicLogo && (
          <img
            src={topicLogo}
            alt={`${topicName} logo`}
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1">
            Add {topicName} to Home Screen
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Always know the latest about {topicName}. Get instant access with one tap.
          </p>

          {isIOS ? (
            <p className="text-xs text-muted-foreground bg-accent p-2 rounded">
              Tap the Share button <span className="inline-block mx-1">⎙</span> then "Add to Home Screen"
            </p>
          ) : deferredPrompt ? (
            <Button
              onClick={handleInstallClick}
              size="sm"
              className="w-full"
            >
              Add to Home Screen
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
};
