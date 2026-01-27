import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, Loader2, Sparkles, Zap } from 'lucide-react';

export type AnimationQuality = 'standard' | 'fast';

interface AnimationQualitySelectorProps {
  onAnimate: (quality: AnimationQuality) => void;
  isAnimating: boolean;
  disabled?: boolean;
}

const qualityOptions: { value: AnimationQuality; label: string; description: string; credits: number; icon: React.ReactNode }[] = [
  {
    value: 'standard',
    label: '720p Standard',
    description: '5s video, higher quality',
    credits: 2,
    icon: <Sparkles className="w-3 h-3" />,
  },
  {
    value: 'fast',
    label: '480p Fast',
    description: '5s video, budget option',
    credits: 1,
    icon: <Zap className="w-3 h-3" />,
  },
];

export function AnimationQualitySelector({
  onAnimate,
  isAnimating,
  disabled = false,
}: AnimationQualitySelectorProps) {
  if (isAnimating) {
    return (
      <Button
        size="sm"
        variant="default"
        disabled
        className="bg-purple-600 hover:bg-purple-700 text-xs"
      >
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Animating...
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="default"
          disabled={disabled}
          className="bg-purple-600 hover:bg-purple-700 text-xs"
        >
          🎬 Animate
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-background z-50">
        {qualityOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onAnimate(option.value)}
            className="flex items-start gap-2 py-2 cursor-pointer"
          >
            <div className="mt-0.5">{option.icon}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.credits} credit{option.credits > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{option.description}</p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
