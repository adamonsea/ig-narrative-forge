import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { IOSInstallModal } from './IOSInstallModal';
import { useStoryViewTracker } from '@/hooks/useStoryViewTracker';

interface AddToHomeScreenProps {
  topicName: string;
  topicSlug: string;
  topicIcon?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const AddToHomeScreen = ({ topicName, topicSlug, topicIcon }: AddToHomeScreenProps) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installCount, setInstallCount] = useState(0);
  const [storiesToday, setStoriesToday] = useState(0);
  const { storiesViewed } = useStoryViewTracker(topicSlug);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    // Check if iOS
    const isIOSDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Check if dismissed multiple times (respect user choice after 3 dismissals)
    const dismissCount = parseInt(localStorage.getItem(`a2hs-dismiss-count-${topicSlug}`) || '0');
    if (dismissCount >= 3) {
      return;
    }

    // Check if recently dismissed (within 7 days)
    const dismissed = localStorage.getItem(`a2hs-dismissed-${topicSlug}`);
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Update manifest link to point to edge function
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/topic-manifest?slug=${topicSlug}`;

    // Update apple-touch-icon
    let appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    if (!appleTouchIcon) {
      appleTouchIcon = document.createElement('link');
      appleTouchIcon.rel = 'apple-touch-icon';
      document.head.appendChild(appleTouchIcon);
    }
    if (topicIcon) {
      appleTouchIcon.href = topicIcon;
    }

    // Update apple-mobile-web-app-title
    let appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement;
    if (!appTitle) {
      appTitle = document.createElement('meta');
      appTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appTitle);
    }
    appTitle.content = topicName;

    // Update document title
    document.title = topicName;

    // Fetch install count and stories today for social proof and urgency
    const fetchStats = async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data: topicData } = await supabase
        .from('topics')
        .select('id')
        .eq('slug', topicSlug)
        .single();

      if (topicData?.id) {
        // Get install count
        const { data: engagementStats } = await supabase.rpc(
          'get_topic_engagement_stats',
          { p_topic_id: topicData.id }
        );
        setInstallCount(Number(engagementStats?.[0]?.pwa_installs || 0));

        // Get stories published today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: topicArticles } = await supabase
          .from('topic_articles')
          .select('id')
          .eq('topic_id', topicData.id);
        
        const topicArticleIds = topicArticles?.map(a => a.id) || [];
        
        if (topicArticleIds.length > 0) {
          const { count } = await supabase
            .from('stories')
            .select('id', { count: 'exact', head: true })
            .in('topic_article_id', topicArticleIds)
            .eq('status', 'published')
            .gte('created_at', today.toISOString());
          
          setStoriesToday(count || 0);
        }
      }
    };

    fetchStats();

    // Listen for the beforeinstallprompt event (Android/Desktop)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [topicName, topicSlug, topicIcon]);

  // Show prompt after user has viewed 3 stories (high engagement signal)
  useEffect(() => {
    if (storiesViewed >= 3 && !showPrompt && (deferredPrompt || isIOS)) {
      setShowPrompt(true);
    }
  }, [storiesViewed, deferredPrompt, isIOS, showPrompt]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Get visitor ID and topic data first
    const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
    if (!localStorage.getItem('visitor_id')) {
      localStorage.setItem('visitor_id', visitorId);
    }

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Get the topic ID from the URL or use the slug
      const { data: topicData } = await supabase
        .from('topics')
        .select('id')
        .eq('slug', topicSlug)
        .single();

      if (topicData?.id) {
        // Track the install button click
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId: topicData.id,
            visitorId,
            metricType: 'pwa_install_clicked',
            userAgent: navigator.userAgent,
          }
        });
      }

      // Show the install prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted' && topicData?.id) {
        console.log('User accepted the install prompt');
        
        // Track successful installation
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId: topicData.id,
            visitorId,
            metricType: 'pwa_installed',
            userAgent: navigator.userAgent,
          }
        });
      }
    } catch (error) {
      console.error('Error tracking PWA install:', error);
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
    localStorage.setItem(`a2hs-dismissed-${topicSlug}`, Date.now().toString());
  };

  const handleDismiss = async () => {
    setShowPrompt(false);
    localStorage.setItem(`a2hs-dismissed-${topicSlug}`, Date.now().toString());
    
    // Increment dismissal count
    const currentCount = parseInt(localStorage.getItem(`a2hs-dismiss-count-${topicSlug}`) || '0');
    localStorage.setItem(`a2hs-dismiss-count-${topicSlug}`, (currentCount + 1).toString());
    
    // Track dismissal
    const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
    if (!localStorage.getItem('visitor_id')) {
      localStorage.setItem('visitor_id', visitorId);
    }

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
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
  };

  const handleIOSInstructionsClick = async () => {
    setShowIOSModal(true);
    
    // Track iOS instruction view
    const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
    if (!localStorage.getItem('visitor_id')) {
      localStorage.setItem('visitor_id', visitorId);
    }
    
    try {
      const { supabase } = await import('@/integrations/supabase/client');
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

  // Generate dynamic messaging
  const getMessage = () => {
    const messages = [];
    
    // Social proof
    if (installCount >= 50) {
      messages.push(`Join ${installCount} readers with instant access`);
    } else if (installCount > 0) {
      messages.push(`Be among the first to add ${topicName} to home screen`);
    }
    
    // Urgency
    if (storiesToday > 0) {
      messages.push(`⚡ ${storiesToday} new ${storiesToday === 1 ? 'story' : 'stories'} today`);
    }
    
    return messages.length > 0 
      ? messages.join(' • ') 
      : `Always know the latest about ${topicName}. Get instant access with one tap.`;
  };

  if (!showPrompt) return null;

  return (
    <>
      <Card className="fixed bottom-4 left-4 right-4 z-50 p-4 shadow-lg border-2 mx-auto max-w-md bg-background">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 hover:bg-accent rounded-full transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex gap-3 items-start">
          {topicIcon && (
            <img
              src={topicIcon}
              alt={`${topicName} icon`}
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          )}
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">
              {installCount >= 50 
                ? `Join ${installCount} readers`
                : `Add ${topicName} to Home Screen`}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              {getMessage()}
            </p>

            {isIOS ? (
              <Button
                onClick={handleIOSInstructionsClick}
                size="sm"
                className="w-full"
                variant="outline"
              >
                See Instructions
              </Button>
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

      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
        topicName={topicName}
      />
    </>
  );
};
