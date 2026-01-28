import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';

export type AnimationQuality = 'standard' | 'fast';

interface AnimationInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: {
    id: string;
    headline?: string;
    title?: string;
    cover_illustration_url?: string | null;
    cover_illustration_prompt?: string | null;
    tone?: string | null;
    animation_suggestions?: string[] | null;
  } | null;
  onAnimate: (params: {
    quality: AnimationQuality;
    customPrompt?: string;
  }) => Promise<void>;
  isAnimating: boolean;
  creditBalance?: number;
  isSuperAdmin: boolean;
}

const ANIMATION_CREDITS = 2; // Comparable to low-tier image generation

export function AnimationInstructionsModal({
  isOpen,
  onClose,
  story,
  onAnimate,
  isAnimating,
  creditBalance,
  isSuperAdmin,
}: AnimationInstructionsModalProps) {
  const [customPrompt, setCustomPrompt] = useState('');
  
  // Only show AI-generated suggestions - no fallback to regex (they're often out of context)
  const suggestions = useMemo(() => {
    if (!story) return [];
    
    // Only use AI-generated suggestions from database
    if (story.animation_suggestions && story.animation_suggestions.length > 0) {
      return story.animation_suggestions;
    }
    
    // No fallback - legacy images without AI suggestions get no pills
    return [];
  }, [story?.id, story?.animation_suggestions]);
  
  // Determine if showing AI suggestions
  const isAiGenerated = suggestions.length > 0;
  
  // Reset customPrompt when story changes
  useEffect(() => {
    setCustomPrompt('');
  }, [story?.id]);
  
  const hasInsufficientCredits = !isSuperAdmin && 
    creditBalance !== undefined && 
    creditBalance < ANIMATION_CREDITS;
  
  const handleSuggestionClick = (suggestion: string) => {
    if (customPrompt === suggestion) {
      setCustomPrompt('');
    } else {
      setCustomPrompt(suggestion);
    }
  };
  
  const handleGenerate = async () => {
    if (!story) return;
    await onAnimate({
      quality: 'fast',
      customPrompt: customPrompt.trim() || undefined,
    });
    setCustomPrompt('');
  };
  
  const handleClose = () => {
    setCustomPrompt('');
    onClose();
  };
  
  if (!story) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Animate Illustration</DialogTitle>
          <DialogDescription className="sr-only">
            Configure animation settings for your story illustration
          </DialogDescription>
        </DialogHeader>
        
        {/* Guidance Header - only show when no AI suggestions */}
        {!isAiGenerated && (
          <div className="text-center pb-3 border-b">
            <p className="text-sm text-muted-foreground">
              Guide motion, not meaning.
            </p>
          </div>
        )}
        
        <div className="space-y-4 py-2">
          {/* AI Suggestions with sparkle indicator */}
          {isAiGenerated && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>AI-suggested for this image</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant={customPrompt === suggestion ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Custom Instructions */}
          <div className="space-y-1.5">
            <Textarea
              placeholder='Describe what should move...'
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              maxLength={200}
              className="min-h-[70px] resize-none text-sm"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              {/* Only show "Leave empty for auto" when there are no AI suggestions */}
              <span>{!customPrompt && !isAiGenerated && 'Leave empty for auto'}</span>
              <span>{customPrompt.length}/200</span>
            </div>
          </div>
          
          {/* Cost display */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Cost: {ANIMATION_CREDITS} credits</span>
            {!isSuperAdmin && creditBalance !== undefined && (
              <span className={`text-xs ${hasInsufficientCredits ? 'text-destructive' : 'text-muted-foreground'}`}>
                Balance: {creditBalance}
              </span>
            )}
          </div>
        </div>
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isAnimating}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isAnimating || hasInsufficientCredits}
          >
            {isAnimating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Animating...
              </>
            ) : (
              '🎬 Animate'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
