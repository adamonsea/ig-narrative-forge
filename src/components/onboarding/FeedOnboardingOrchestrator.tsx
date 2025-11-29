import { useEffect, useState, useCallback } from 'react';
import { WelcomeFlashCardModal } from './WelcomeFlashCardModal';
import { OnboardingTooltip } from './OnboardingTooltip';
import { HandSwipeHint } from '../HandSwipeHint';

interface OnboardingConfig {
  welcomeCardEnabled?: boolean;
  welcomeCardHeadline?: string;
  welcomeCardCtaText?: string;
  welcomeCardAboutLink?: boolean;
  aboutPageEnabled?: boolean;
}

interface FeedOnboardingOrchestratorProps {
  topicSlug: string;
  playModeEnabled?: boolean;
  config?: OnboardingConfig;
  onWelcomeClose?: () => void;
}

type OnboardingStep = 'welcome' | 'live' | 'filter' | 'play' | 'notifications' | 'complete';

export const FeedOnboardingOrchestrator = ({
  topicSlug,
  playModeEnabled = false,
  config = {},
  onWelcomeClose
}: FeedOnboardingOrchestratorProps) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('complete');
  const [hasStarted, setHasStarted] = useState(false);

  // Debug helper - expose to window for testing
  useEffect(() => {
    (window as any).resetOnboarding = () => {
      localStorage.removeItem(`welcome_shown_${topicSlug}`);
      localStorage.removeItem(`onboarding_complete_${topicSlug}`);
      console.log(`[Onboarding] Reset for ${topicSlug} - refresh page to see welcome card`);
      window.location.reload();
    };
  }, [topicSlug]);

  // Check if onboarding has been completed for this topic
  useEffect(() => {
    const welcomeShown = localStorage.getItem(`welcome_shown_${topicSlug}`);
    const onboardingComplete = localStorage.getItem(`onboarding_complete_${topicSlug}`);

    // Debug logging
    console.log('[Onboarding] Config:', {
      topicSlug,
      welcomeCardEnabled: config.welcomeCardEnabled,
      welcomeShown,
      onboardingComplete
    });

    if (onboardingComplete) {
      console.log('[Onboarding] Already complete, skipping');
      setCurrentStep('complete');
      return;
    }

    // Determine starting step
    if (config.welcomeCardEnabled && !welcomeShown) {
      console.log('[Onboarding] Starting with welcome card');
      setCurrentStep('welcome');
      setHasStarted(true);
    } else if (!welcomeShown && !onboardingComplete) {
      // Skip welcome, start with tooltips
      console.log('[Onboarding] Welcome disabled, starting with live tooltip');
      setCurrentStep('live');
      setHasStarted(true);
    } else {
      console.log('[Onboarding] No onboarding to show');
    }
  }, [topicSlug, config.welcomeCardEnabled]);

  const advanceToNextStep = useCallback(() => {
    setCurrentStep(prev => {
      switch (prev) {
        case 'welcome':
          onWelcomeClose?.();
          return 'live';
        case 'live':
          return 'filter';
        case 'filter':
          return playModeEnabled ? 'play' : 'notifications';
        case 'play':
          return 'notifications';
        case 'notifications':
          // Mark onboarding complete
          localStorage.setItem(`onboarding_complete_${topicSlug}`, 'true');
          return 'complete';
        default:
          return 'complete';
      }
    });
  }, [topicSlug, playModeEnabled, onWelcomeClose]);

  const handleWelcomeClose = useCallback(() => {
    advanceToNextStep();
  }, [advanceToNextStep]);

  const handleTooltipDismiss = useCallback(() => {
    advanceToNextStep();
  }, [advanceToNextStep]);

  if (currentStep === 'complete' || !hasStarted) {
    return null;
  }

  return (
    <>
      {/* Welcome Flash Card Modal */}
      <WelcomeFlashCardModal
        isOpen={currentStep === 'welcome'}
        onClose={handleWelcomeClose}
        topicSlug={topicSlug}
        headline={config.welcomeCardHeadline}
        ctaText={config.welcomeCardCtaText}
        showAboutLink={config.welcomeCardAboutLink}
        aboutPageEnabled={config.aboutPageEnabled}
      />

      {/* Tooltip 1: Live Badge */}
      <OnboardingTooltip
        message="New stories added throughout the day"
        targetSelector="[data-onboarding='live-badge']"
        position="bottom"
        isVisible={currentStep === 'live'}
        onDismiss={handleTooltipDismiss}
        autoDismissMs={3000}
      />

      {/* Tooltip 2: Filter Button */}
      <OnboardingTooltip
        message="Filter by topic or source"
        targetSelector="[data-onboarding='filter-button']"
        position="bottom"
        isVisible={currentStep === 'filter'}
        onDismiss={handleTooltipDismiss}
        autoDismissMs={3000}
      />

      {/* Tooltip 3: Play Mode (if enabled) */}
      {playModeEnabled && (
        <OnboardingTooltip
          message="Swipe to rate stories"
          targetSelector="[data-onboarding='play-mode']"
          position="bottom"
          isVisible={currentStep === 'play'}
          onDismiss={handleTooltipDismiss}
          autoDismissMs={3000}
        />
      )}

      {/* Tooltip 4: Notifications */}
      <OnboardingTooltip
        message="Get notified when stories drop"
        targetSelector="[data-onboarding='notifications']"
        position="bottom"
        isVisible={currentStep === 'notifications'}
        onDismiss={handleTooltipDismiss}
        autoDismissMs={3000}
      />
    </>
  );
};
