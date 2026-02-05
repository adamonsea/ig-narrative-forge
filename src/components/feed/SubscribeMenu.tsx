import { useState } from 'react';
import { Bell, ChevronDown, Calendar, CalendarDays, Layers } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NewsletterSignupModal, type SubscriptionFrequency } from '@/components/NewsletterSignupModal';

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

  const handleSelectFrequency = (frequency: SubscriptionFrequency) => {
    setSelectedFrequency(frequency);
    setIsModalOpen(true);
  };

  const frequencyOptions = [
    {
      value: 'daily' as const,
      icon: Calendar,
      label: 'Daily',
      description: 'Get updates every day',
    },
    {
      value: 'weekly' as const,
      icon: CalendarDays,
      label: 'Weekly',
      description: 'Weekly digest of top stories',
    },
    {
      value: 'both' as const,
      icon: Layers,
      label: 'Both',
      description: 'Daily updates + weekly digest',
    },
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
            <Bell className={`w-4 h-4 transition-colors ${
              showPulse ? 'text-primary' : ''
            }`} />
            {showLabel && <span className="text-sm font-medium">Subscribe</span>}
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
              <div className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
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
