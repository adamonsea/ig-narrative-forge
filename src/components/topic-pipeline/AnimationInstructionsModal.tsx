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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, Zap } from 'lucide-react';

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

const qualityOptions = [
  {
    value: 'standard' as AnimationQuality,
    label: '720p Standard',
    description: '5s video, higher quality',
    credits: 2,
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    value: 'fast' as AnimationQuality,
    label: '480p Fast',
    description: '5s video, budget option',
    credits: 1,
    icon: <Zap className="w-4 h-4" />,
  },
];

/**
 * Generates smart animation suggestions based on story context
 */
function generateSmartSuggestions(story: {
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
  
  if (prompt.match(/landscape|nature|park|garden|sea|beach|water/)) {
    return [
      'Gentle wave motion',
      'Leaves or grass sway',
      'Clouds drift slowly',
      'Water ripples',
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
  const [quality, setQuality] = useState<AnimationQuality>('fast');
  
  const selectedQuality = qualityOptions.find(q => q.value === quality)!;
  
  const suggestions = useMemo(() => {
    if (!story) return [];
    return generateSmartSuggestions({
      cover_illustration_prompt: story.cover_illustration_prompt,
      headline: story.headline,
      title: story.title,
      tone: story.tone,
    });
  }, [story]);
  
  const hasInsufficientCredits = !isSuperAdmin && 
    creditBalance !== undefined && 
    creditBalance < selectedQuality.credits;
  
  const handleSuggestionClick = (suggestion: string) => {
    // If clicking the same suggestion, deselect it
    if (customPrompt === suggestion) {
      setCustomPrompt('');
    } else {
      setCustomPrompt(suggestion);
    }
  };
  
  const handleGenerate = async () => {
    if (!story) return;
    await onAnimate({
      quality,
      customPrompt: customPrompt.trim() || undefined,
    });
    // Reset state after generation
    setCustomPrompt('');
    setQuality('fast');
  };
  
  const handleClose = () => {
    setCustomPrompt('');
    setQuality('fast');
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
        <div className="text-center space-y-1 pb-4 border-b">
          <p className="font-medium text-foreground text-sm">
            "Guide the motion, not the meaning."
          </p>
          <p className="text-xs text-muted-foreground">
            Tell the AI what to animate and how it should move.
            <br />Style and story stay exactly as they are.
          </p>
        </div>
        
        <div className="space-y-4 py-2">
          {/* Smart Suggestions */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Smart Suggestions</Label>
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
          
          {/* Custom Instructions */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Or write your own</Label>
            <Textarea
              placeholder='e.g., "Focus on hands, papers move slightly, face stays still"'
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              maxLength={200}
              className="min-h-[80px] resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {customPrompt.length}/200
            </p>
          </div>
          
          {/* Quality Selector */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Quality</Label>
              <Select value={quality} onValueChange={(v) => setQuality(v as AnimationQuality)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {qualityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {option.icon}
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="text-right">
              <p className="text-sm font-medium">
                Cost: {selectedQuality.credits} credit{selectedQuality.credits > 1 ? 's' : ''}
              </p>
              {!isSuperAdmin && creditBalance !== undefined && (
                <p className={`text-xs ${hasInsufficientCredits ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Balance: {creditBalance} credits
                </p>
              )}
              {isSuperAdmin && (
                <p className="text-xs text-green-600">Admin: Free</p>
              )}
            </div>
          </div>
          
          {/* Empty state hint */}
          {!customPrompt && (
            <p className="text-xs text-muted-foreground italic text-center">
              Leave empty to let AI auto-generate motion instructions
            </p>
          )}
        </div>
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isAnimating}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isAnimating || hasInsufficientCredits}
            className="bg-primary hover:bg-primary/90"
          >
            {isAnimating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Animating...
              </>
            ) : (
              <>
                🎬 Generate Animation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
