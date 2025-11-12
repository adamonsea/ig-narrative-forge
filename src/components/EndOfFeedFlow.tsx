import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NotificationPreferencesModal } from './NotificationPreferencesModal';
import { IOSInstallModal } from './IOSInstallModal';
import { Bell, Sparkles, Plus, ArrowRight } from 'lucide-react';

interface EndOfFeedFlowProps {
  topicName: string;
  topicId: string;
  topicSlug: string;
  topicIcon?: string;
}

export const EndOfFeedFlow = ({ topicName, topicId, topicSlug, topicIcon }: EndOfFeedFlowProps) => {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [step, setStep] = useState<'intro' | 'homescreen' | 'notifications'>('intro');
  const [installCount, setInstallCount] = useState(0);
  const [storiesToday, setStoriesToday] = useState(0);

  // Fetch stats for social proof and urgency
  useEffect(() => {
    const fetchStats = async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Get install count
      const { data: engagementStats } = await supabase.rpc(
        'get_topic_engagement_stats',
        { p_topic_id: topicId }
      );
      setInstallCount(Number(engagementStats?.[0]?.pwa_installs || 0));

      // Get stories published today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: topicArticles } = await supabase
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicId);
      
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
    };

    if (topicId) {
      fetchStats();
    }
  }, [topicId]);

  const handleAddToHomeScreen = async () => {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    
    // Track the interaction
    const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
    if (!localStorage.getItem('visitor_id')) {
      localStorage.setItem('visitor_id', visitorId);
    }

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      if (isIOS) {
        // Track iOS instruction view
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId,
            visitorId,
            metricType: 'pwa_ios_instructions_viewed',
            userAgent: navigator.userAgent,
          }
        });
        
        // For iOS, show modal instructions
        setShowIOSModal(true);
      } else {
        // Track install button click
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId,
            visitorId,
            metricType: 'pwa_install_clicked',
            userAgent: navigator.userAgent,
          }
        });
        
        // For Android/Desktop, trigger install prompt if available
        const deferredPrompt = (window as any).deferredPrompt;
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          
          if (outcome === 'accepted') {
            // Track successful installation
            await supabase.functions.invoke('track-engagement-metric', {
              body: {
                topicId,
                visitorId,
                metricType: 'pwa_installed',
                userAgent: navigator.userAgent,
              }
            });
          }
          
          (window as any).deferredPrompt = null;
        }
      }
    } catch (error) {
      console.error('Failed to track A2HS interaction:', error);
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
            <h3 className="text-2xl font-bold">
              {installCount >= 50 ? `Join ${installCount} readers` : 'Add to Home Screen?'}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Get instant access to <strong>{topicName}</strong> with one tap from your home screen.
              {storiesToday > 0 && (
                <span className="block mt-1">
                  ⚡ {storiesToday} new {storiesToday === 1 ? 'story' : 'stories'} today
                </span>
              )}
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

      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
        topicName={topicName}
      />
    </>
  );
};
