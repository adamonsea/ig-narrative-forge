import { useEffect, useState } from 'react';
import { X, Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IOSInstallModal } from '../IOSInstallModal';
import { supabase } from '@/integrations/supabase/client';

interface InlinePWACardProps {
  topicName: string;
  topicSlug: string;
  topicIcon?: string;
  storiesScrolledPast: number;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InlinePWACard = ({ 
  topicName, 
  topicSlug, 
  topicIcon,
  storiesScrolledPast 
}: InlinePWACardProps) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [appearances, setAppearances] = useState(0);
  const [installCount, setInstallCount] = useState(0);

  const STORIES_BEFORE_FIRST = 5;
  const STORIES_BETWEEN = 10;
  const MAX_APPEARANCES = 3;

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setDismissed(true);
      return;
    }

    // Check if iOS
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent));

    // Check permanent dismissal count
    const dismissCount = parseInt(localStorage.getItem(`a2hs-dismiss-count-${topicSlug}`) || '0');
    if (dismissCount >= 3) {
      setDismissed(true);
      return;
    }

    // Load appearance count
    const storedAppearances = parseInt(localStorage.getItem(`a2hs-appearances-${topicSlug}`) || '0');
    setAppearances(storedAppearances);

    // Fetch install count for social proof
    const fetchStats = async () => {
      const { data: topicData } = await supabase
        .from('topics')
        .select('id')
        .eq('slug', topicSlug)
        .single();

      if (topicData?.id) {
        const { data: engagementStats } = await supabase.rpc(
          'get_topic_engagement_stats',
          { p_topic_id: topicData.id }
        );
        setInstallCount(Number(engagementStats?.[0]?.pwa_installs || 0));
      }
    };

    fetchStats();

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [topicSlug]);

  // Calculate if should show based on stories scrolled
  const targetStoryCount = STORIES_BEFORE_FIRST + (appearances * STORIES_BETWEEN);
  const shouldShow = !dismissed && 
    storiesScrolledPast >= targetStoryCount && 
    appearances < MAX_APPEARANCES &&
    (deferredPrompt || isIOS);

  // Track appearance
  useEffect(() => {
    if (shouldShow && storiesScrolledPast === targetStoryCount) {
      const newAppearances = appearances + 1;
      setAppearances(newAppearances);
      localStorage.setItem(`a2hs-appearances-${topicSlug}`, newAppearances.toString());
    }
  }, [shouldShow, storiesScrolledPast, targetStoryCount, appearances, topicSlug]);

  const handleDismiss = async () => {
    setDismissed(true);
    
    const currentCount = parseInt(localStorage.getItem(`a2hs-dismiss-count-${topicSlug}`) || '0');
    localStorage.setItem(`a2hs-dismiss-count-${topicSlug}`, (currentCount + 1).toString());

    // Track dismissal
    const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
    if (!localStorage.getItem('visitor_id')) {
      localStorage.setItem('visitor_id', visitorId);
    }

    try {
      const { data: topicData } = await supabase
        .from('topics')
        .select('id')
        .eq('slug', topicSlug)
        .single();

      if (topicData?.id) {
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId: topicData.id,
            visitorId,
            metricType: 'pwa_dismissed',
            userAgent: navigator.userAgent,
          }
        });
      }
    } catch (error) {
      console.error('Failed to track dismissal:', error);
    }

    // Reset for next appearance
    setTimeout(() => setDismissed(false), 100);
  };

  const handleInstallClick = async () => {
    const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
    if (!localStorage.getItem('visitor_id')) {
      localStorage.setItem('visitor_id', visitorId);
    }

    try {
      const { data: topicData } = await supabase
        .from('topics')
        .select('id')
        .eq('slug', topicSlug)
        .single();

      if (topicData?.id) {
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId: topicData.id,
            visitorId,
            metricType: 'pwa_install_clicked',
            userAgent: navigator.userAgent,
          }
        });
      }

      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted' && topicData?.id) {
          await supabase.functions.invoke('track-engagement-metric', {
            body: {
              topicId: topicData.id,
              visitorId,
              metricType: 'pwa_installed',
              userAgent: navigator.userAgent,
            }
          });
        }
      }
    } catch (error) {
      console.error('Error tracking PWA install:', error);
    }

    setDeferredPrompt(null);
    setDismissed(true);
    localStorage.setItem(`a2hs-dismiss-count-${topicSlug}`, '3');
  };

  const handleIOSClick = async () => {
    setShowIOSModal(true);

    const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
    if (!localStorage.getItem('visitor_id')) {
      localStorage.setItem('visitor_id', visitorId);
    }

    try {
      const { data: topicData } = await supabase
        .from('topics')
        .select('id')
        .eq('slug', topicSlug)
        .single();

      if (topicData?.id) {
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId: topicData.id,
            visitorId,
            metricType: 'pwa_ios_instructions_viewed',
            userAgent: navigator.userAgent,
          }
        });
      }
    } catch (error) {
      console.error('Failed to track iOS view:', error);
    }
  };

  if (!shouldShow) return null;

  return (
    <>
      <Card className="relative overflow-hidden border bg-gradient-to-r from-primary/5 to-primary/10">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-accent transition-colors z-10"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="p-4 flex items-center gap-4">
          {topicIcon ? (
            <img
              src={topicIcon}
              alt={`${topicName} icon`}
              className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground mb-0.5">
              {installCount >= 50 
                ? `Join ${installCount} readers` 
                : "Add to Home Screen"}
            </p>
            <p className="text-xs text-muted-foreground">
              Quick access with one tap
            </p>
          </div>

          {isIOS ? (
            <Button
              onClick={handleIOSClick}
              size="sm"
              variant="outline"
              className="flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          ) : deferredPrompt ? (
            <Button
              onClick={handleInstallClick}
              size="sm"
              className="flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          ) : null}
        </div>
      </Card>

      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
        topicName={topicName}
      />
    </>
  );
};
