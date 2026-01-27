import React, { useState, useMemo } from 'react';
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
import { Loader2 } from 'lucide-react';

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
  } | null;
  onAnimate: (params: {
    quality: AnimationQuality;
    customPrompt?: string;
  }) => Promise<void>;
  isAnimating: boolean;
  creditBalance?: number;
  isSuperAdmin: boolean;
}

const ANIMATION_CREDITS = 1;

/**
 * Generates animation suggestions based on story context
 */
function generateSuggestions(story: {
  cover_illustration_prompt?: string | null;
  headline?: string;
  title?: string;
  tone?: string | null;
}): string[] {
  const prompt = (story.cover_illustration_prompt || '').toLowerCase();
  const titleText = (story.headline || story.title || '').toLowerCase();
  const tone = (story.tone || '').toLowerCase();
  
  // Subject-based suggestions from image prompt
  if (prompt.match(/person|official|councillor|worker|figure|man|woman|portrait/)) {
    return [
      'Gentle head nod',
      'Subtle hand gesture',
      'Slight weight shift',
      'Papers shuffle on desk',
    ];
  }
  
  if (prompt.match(/crowd|group|protesters|gathering|people|assembly/)) {
    return [
      'Closest figure sways gently',
      'One raised sign moves',
      'Single person gestures',
      'Background frozen, center moves',
    ];
  }
  
  if (prompt.match(/building|structure|hall|shop|store|house|architecture/)) {
    return [
      'Flag or banner flutters',
      'Window light flickers',
      'Smoke or steam wisps',
      'Leaves rustle nearby',
    ];
  }
  
  if (prompt.match(/vehicle|car|bus|train|digger|machinery|excavator/)) {
    return [
      'Subtle idle vibration',
      'Exhaust movement',
      'Wheel creep motion',
      'Headlight flicker',
    ];
  }
  
  if (prompt.match(/landscape|nature|park|garden|sea|beach|water|helicopter|rescue|coast/)) {
    return [
      'Gentle wave motion',
      'Leaves or grass sway',
      'Clouds drift slowly',
      'Water ripples',
    ];
  }
  
  if (prompt.match(/helicopter|aircraft|plane|flying/)) {
    return [
      'Rotor blades spin',
      'Aircraft hovers gently',
      'Winch line sways',
      'Clouds drift past',
    ];
  }
  
  // Title-based suggestions (fallback)
  if (titleText.match(/council|meeting|debate|vote|parliament/)) {
    return [
      'Official nods slightly',
      'Hand gesture while speaking',
      'Document movement only',
      'Pen taps on table',
    ];
  }
  
  if (titleText.match(/protest|rally|march|demonstration/)) {
    return [
      'Signs wave gently',
      'Central figure gestures',
      'Crowd sways subtly',
      'Banner ripples',
    ];
  }
  
  if (titleText.match(/construction|building|development|work/)) {
    return [
      'Machinery vibrates',
      'Worker moves slightly',
      'Dust particles drift',
      'Crane arm shifts',
    ];
  }
  
  if (titleText.match(/rescue|emergency|helicopter|coast/)) {
    return [
      'Helicopter hovers',
      'Waves crash below',
      'Wind movement',
      'Rescue line sways',
    ];
  }
  
  // Tone-based adjustments
  if (tone === 'urgent' || tone === 'breaking') {
    return [
      'Quick focal point motion',
      'Urgent hand gesture',
      'Alert head turn',
      'Dynamic center movement',
    ];
  }
  
  if (tone === 'somber' || tone === 'reflective') {
    return [
      'Slow gentle breathing',
      'Minimal subtle sway',
      'Quiet contemplative nod',
      'Still except focal point',
    ];
  }
  
  // Generic suggestions
  return [
    'Central subject breathes',
    'Gentle motion in focal point',
    'Subtle sway, static background',
    'One element moves softly',
  ];
}

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
  
  const suggestions = useMemo(() => {
    if (!story) return [];
    return generateSuggestions({
      cover_illustration_prompt: story.cover_illustration_prompt,
      headline: story.headline,
      title: story.title,
      tone: story.tone,
    });
  }, [story]);
  
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
        
        {/* Guidance Header */}
        <div className="text-center pb-3 border-b">
          <p className="text-sm text-muted-foreground">
            Guide the motion, not the meaning.
          </p>
        </div>
        
        <div className="space-y-4 py-2">
          {/* Suggestions */}
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
          
          {/* Custom Instructions */}
          <div className="space-y-1.5">
            <Textarea
              placeholder='Or describe what should move...'
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              maxLength={200}
              className="min-h-[70px] resize-none text-sm"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{!customPrompt && 'Leave empty for auto'}</span>
              <span>{customPrompt.length}/200</span>
            </div>
          </div>
          
          {/* Cost display */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Cost: {ANIMATION_CREDITS} credit</span>
            {isSuperAdmin ? (
              <span className="text-xs text-emerald-600">Admin: Free</span>
            ) : creditBalance !== undefined && (
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
