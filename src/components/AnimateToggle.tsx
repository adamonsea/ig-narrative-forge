import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';

interface AnimateToggleProps {
  isAnimated: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  baseCredits: number;
}

const ANIMATION_CREDITS = 12; // Fixed 2-second animation cost

export const AnimateToggle: React.FC<AnimateToggleProps> = ({
  isAnimated,
  onToggle,
  disabled = false,
  baseCredits
}) => {
  const totalCredits = baseCredits + (isAnimated ? ANIMATION_CREDITS : 0);

  return (
    <div className="flex flex-col gap-2 p-3 border rounded-lg bg-muted/30">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="animate"
          checked={isAnimated}
          onCheckedChange={onToggle}
          disabled={disabled}
        />
        <Label
          htmlFor="animate"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="w-3 h-3" />
          Animate (2s) +{ANIMATION_CREDITS} credits
        </Label>
      </div>
      <div className="text-xs text-muted-foreground pl-6">
        Total: <span className="font-semibold">{totalCredits} credits</span>
      </div>
    </div>
  );
};
