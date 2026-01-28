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

const ANIMATION_CREDITS = 2; // Comparable to low-tier image generation

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
  const combinedText = `${prompt} ${titleText}`;
  
  // Check for specific subjects in the combined text
  // Order matters - more specific matches should come first
  
  // Baby/birth/medical
  if (combinedText.match(/baby|birth|midwi|newborn|hospital|nhs|doctor|nurse|patient|health|medical|clinic|surgery/)) {
    return [
      'Baby wiggles gently',
      'Proud parent smiles',
      'Subtle breathing motion',
      'Soft light flickers',
    ];
  }
  
  // Performance/entertainment - be more specific to avoid false positives
  if (combinedText.match(/magician|theatre|theater|stage show|performer|hypnot|audience watching|pocket watch|swing dance|concert|musician|band|orchestra/)) {
    return [
      'Watch swings gently',
      'Performer gestures slowly',
      'Audience member sways',
      'Stage curtain ripples',
    ];
  }
  
  // Emergency/rescue
  if (combinedText.match(/helicopter|rescue|coast guard|cliff|emergency|lifeboat|winch|paramedic|ambulance|fire brigade|firefight/)) {
    return [
      'Helicopter hovers',
      'Rotor blades spin',
      'Rescue line sways',
      'Waves crash below',
    ];
  }
  
  // People/portraits
  if (combinedText.match(/person|official|councillor|worker|figure|portrait|police|officer|mp\b|minister|mayor|councillor/)) {
    return [
      'Gentle head nod',
      'Subtle hand gesture',
      'Slight weight shift',
      'Papers shuffle on desk',
    ];
  }
  
  // Crowds/groups
  if (combinedText.match(/crowd|group|protest|gather|people|assembly|march|rally|demonstration|festival|parade/)) {
    return [
      'Closest figure sways',
      'One sign waves gently',
      'Single person gestures',
      'Banner ripples',
    ];
  }
  
  // Buildings/architecture
  if (combinedText.match(/building|structure|hall|shop|store|house|architecture|development|construction|demolition|planning/)) {
    return [
      'Flag or banner flutters',
      'Window light flickers',
      'Smoke wisps drift',
      'Leaves rustle nearby',
    ];
  }
  
  // Vehicles/machinery
  if (combinedText.match(/vehicle|car|bus|train|digger|machinery|excavator|lorry|truck|crane|road|traffic/)) {
    return [
      'Subtle idle vibration',
      'Exhaust wisps rise',
      'Wheel creeps slowly',
      'Warning light blinks',
    ];
  }
  
  // Nature/outdoors
  if (combinedText.match(/landscape|nature|park|garden|sea|beach|water|tree|field|countryside|weather|rain|snow|sun/)) {
    return [
      'Gentle wave motion',
      'Leaves and grass sway',
      'Clouds drift slowly',
      'Water ripples softly',
    ];
  }
  
  // Animals
  if (combinedText.match(/dog|cat|animal|pet|bird|wildlife|horse|farm|zoo|sanctuary/)) {
    return [
      'Animal breathes gently',
      'Tail wags or flicks',
      'Ears twitch slightly',
      'Head turns slowly',
    ];
  }
  
  // Sports/activity
  if (combinedText.match(/football|sport|match|game|player|runner|athlete|gym|exercise|tennis|cricket|rugby/)) {
    return [
      'Ball bounces gently',
      'Player shifts weight',
      'Crowd sways in sync',
      'Flag waves slowly',
    ];
  }
  
  // Food/restaurant
  if (combinedText.match(/restaurant|food|chef|kitchen|cafe|pub|bar|drink|eat|bakery|takeaway/)) {
    return [
      'Steam rises gently',
      'Chef stirs slowly',
      'Glass contents swirl',
      'Flame flickers',
    ];
  }
  
  // Generic suggestions based on any visual content
  return [
    'Central subject breathes',
    'Gentle focal point motion',
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
  }, [story?.id, story?.cover_illustration_prompt, story?.headline, story?.title, story?.tone]);
  
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
