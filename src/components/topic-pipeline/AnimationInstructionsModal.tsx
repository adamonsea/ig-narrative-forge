import React, { useState, useMemo, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import { ANIMATION_CREDIT_COSTS } from '@/lib/billing';

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
  isAdmin: boolean;
}

// Animation always runs on the fast (480p) tier from this dialog.
const ANIMATION_CREDITS = ANIMATION_CREDIT_COSTS.fast;

export function AnimationInstructionsModal({
  isOpen,
  onClose,
  story,
  onAnimate,
  isAnimating,
  creditBalance,
  isAdmin,
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
  
  const hasInsufficientCredits = !isAdmin && 
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
    const prompt = customPrompt.trim() || undefined;
    setCustomPrompt('');
    onClose();
    await onAnimate({
      quality: 'fast',
      customPrompt: prompt,
    });
  };
  
  const handleClose = () => {
    setCustomPrompt('');
    onClose();
  };
  
  if (!story) return null;
  
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="panel" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Animate picture</SheetTitle>
          <SheetDescription className="sr-only">Describe what should move in the picture.</SheetDescription>
        </SheetHeader>

        {isAiGenerated && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Suggested
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  aria-pressed={customPrompt === suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${customPrompt === suggestion ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Textarea
            placeholder={isAiGenerated ? "What should move?" : "What should move? Leave empty for auto"}
            aria-label="What should move"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            maxLength={200}
            className="min-h-[72px] resize-none text-base"
          />
          <p className="text-right text-sm text-muted-foreground tabular-nums">{customPrompt.length}/200</p>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{ANIMATION_CREDITS} credits</span>
          {!isAdmin && creditBalance !== undefined && (
            <span className={hasInsufficientCredits ? "text-destructive" : "text-muted-foreground"}>
              {creditBalance} left
            </span>
          )}
        </div>

        <div className="mt-auto flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={handleClose} disabled={isAnimating}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={isAnimating || hasInsufficientCredits}>
            {isAnimating ? "Animating" : "Animate"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
