import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export type AnimationQuality = 'standard' | 'fast';

interface AnimationQualitySelectorProps {
  onAnimate: (quality?: AnimationQuality) => void;
  isAnimating: boolean;
  disabled?: boolean;
}

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
        className="text-xs"
      >
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Animating...
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="default"
      disabled={disabled}
      onClick={() => onAnimate()}
      className="text-xs"
    >
      🎬 Animate
    </Button>
  );
}
