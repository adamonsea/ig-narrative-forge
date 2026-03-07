import { useState, useMemo } from 'react';
import { Bell, Mail, ChevronDown, Calendar, CalendarDays, Layers } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NewsletterSignupModal, type SubscriptionFrequency } from '@/components/NewsletterSignupModal';
import { useABTestTracking } from '@/hooks/useABTestTracking';
import { getVariantConfig } from '@/lib/abTesting';

interface SubscribeMenuProps {
  topicName: string;
  topicId: string;
  showLabel?: boolean;
  showPulse?: boolean;
  className?: string;
}

export const SubscribeMenu = ({
  topicName,
  topicId,
  showLabel = true,
  showPulse = false,
  className = '',
}: SubscribeMenuProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState<SubscriptionFrequency>('weekly');

  // Get or create visitor ID for AB test tracking
  const visitorId = useMemo(() => {
    let id = localStorage.getItem('visitor_id');
    if (!id) {
      id = `visitor_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('visitor_id', id);
    }
    return id;
  }, []);

  // Wire AB test tracking
  const { variant, isActive: isTestActive, trackClick } = useABTestTracking({
    testName: 'subscribe_button_label',
    visitorId,
    topicId,
    trackImpression: true,
  });

  // Determine button label and icon based on AB test variant
  const variantConfig = getVariantConfig('subscribe_button_label', visitorId);
  const buttonLabel = isTestActive && variantConfig ? variantConfig.label : 'Subscribe';
  const ButtonIcon = isTestActive && variantConfig?.icon === 'Mail' ? Mail : Bell;

  const handleSelectFrequency = (frequency: SubscriptionFrequency) => {
    setSelectedFrequency(frequency);
    setIsModalOpen(true);
    // Track the click event for the AB test
    trackClick();
  };

  const frequencyOptions = [
    { value: 'daily' as const, icon: Calendar, label: 'Daily' },
    { value: 'weekly' as const, icon: CalendarDays, label: 'Weekly' },
    { value: 'both' as const, icon: Layers, label: 'Both' },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-all ${
              showPulse ? 'bg-primary/10 animate-pulse' : ''
            } ${className}`}
            aria-label="Subscribe options"
          >
            <ButtonIcon className={`w-4 h-4 transition-colors ${
              showPulse ? 'text-primary' : ''
            }`} />
            {showLabel && <span className="text-sm font-medium">{buttonLabel}</span>}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 z-[60]">
          {frequencyOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => handleSelectFrequency(option.value)}
              className="cursor-pointer"
            >
              <option.icon className="w-4 h-4 mr-2" />
              <span className="font-medium">{option.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <NewsletterSignupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        topicName={topicName}
        topicId={topicId}
        defaultFrequency={selectedFrequency}
      />
    </>
  );
};
