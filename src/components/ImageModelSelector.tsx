import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { ILLUSTRATION_STYLES, ILLUSTRATION_STYLE_LABELS, type IllustrationStyle } from '@/lib/constants/illustrationStyles';
import { IMAGE_CREDIT_COSTS, SATIRICAL_IMAGE_CREDIT_COST } from '@/lib/billing';

// ============================================================
// FEATURE FLAG: MidJourney Experimental Mode
// Set to false to hide MidJourney options from the dropdown
// ============================================================
const ENABLE_MIDJOURNEY = false;

export interface ImageModel {
  id: string;
  name: string;
  credits: number;
  provider: string;
  description?: string;
  experimental?: boolean;
}

// Illustrative models (editorial cartoon style) - GPT Image 2
// Cheapest first: most covers only need the quick tier.
export const illustrativeModels: ImageModel[] = [
  {
    id: 'gpt-image-2-low',
    name: 'Quick',
    credits: IMAGE_CREDIT_COSTS['gpt-image-2-low'],
    provider: 'openai',
    description: 'Fast generation, good quality (GPT-Image-2)'
  },
  {
    id: 'gpt-image-2-medium',
    name: 'Creative',
    credits: IMAGE_CREDIT_COSTS['gpt-image-2-medium'],
    provider: 'openai',
    description: 'Balanced quality and cost (GPT-Image-2)'
  },
  {
    id: 'gpt-image-2-high',
    name: 'Best',
    credits: IMAGE_CREDIT_COSTS['gpt-image-2-high'],
    provider: 'openai',
    description: 'Highest quality editorial illustrations (GPT-Image-2)'
  }
];

// Photographic models (documentary/photojournalism style) - GPT Image 2
export const photographicModels: ImageModel[] = [
  {
    id: 'gpt-image-2-low',
    name: 'Quick',
    credits: IMAGE_CREDIT_COSTS['gpt-image-2-low'],
    provider: 'openai',
    description: 'Fast generation, good quality (GPT-Image-2)'
  },
  {
    id: 'gpt-image-2-medium',
    name: 'Creative',
    credits: IMAGE_CREDIT_COSTS['gpt-image-2-medium'],
    provider: 'openai',
    description: 'Balanced quality and cost (GPT-Image-2)'
  },
  {
    id: 'gpt-image-2-high',
    name: 'Best',
    credits: IMAGE_CREDIT_COSTS['gpt-image-2-high'],
    provider: 'openai',
    description: 'Highest quality photorealistic images (GPT-Image-2)'
  }
];

// MidJourney models (experimental via KIE API)
export const midjourneyModels: ImageModel[] = [
  {
    id: 'midjourney-fast',
    name: 'MidJourney Fast',
    credits: 6,
    provider: 'midjourney',
    description: 'Fast generation (~30s), high quality',
    experimental: true
  },
  {
    id: 'midjourney-relaxed',
    name: 'MidJourney Relaxed',
    credits: 4,
    provider: 'midjourney',
    description: 'Slower (~2-3 min), same quality, cheaper',
    experimental: true
  }
];

// Legacy export for backward compatibility
export const imageModels = illustrativeModels;

// Satirical cartoons always render on Sunburst medium after a joke-writing step
export const satiricalModel: ImageModel = {
  id: 'gpt-image-2.5-sunburst-medium',
  name: 'Satirical cartoon',
  credits: SATIRICAL_IMAGE_CREDIT_COST,
  provider: 'openai',
  description: 'A joke is written first, then drawn as a broadsheet pocket cartoon',
};

interface ImageModelSelectorProps {
  /** style is the per-story choice (defaults to the feed's style) */
  onModelSelect: (model: ImageModel, style?: IllustrationStyle) => void;
  isGenerating?: boolean;
  hasExistingImage?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost' | 'link';
  illustrationStyle?: IllustrationStyle;
}

export const ImageModelSelector: React.FC<ImageModelSelectorProps> = ({
  onModelSelect,
  isGenerating = false,
  hasExistingImage = false,
  disabled = false,
  size = 'sm',
  variant = 'outline',
  illustrationStyle = ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE
}) => {
  const buttonText = hasExistingImage ? 'Regenerate Cover' : 'Generate Cover';
  const [chosenStyle, setChosenStyle] = React.useState<IllustrationStyle>(illustrationStyle);
  React.useEffect(() => setChosenStyle(illustrationStyle), [illustrationStyle]);

  // Select appropriate model list based on illustration style
  const availableModels = chosenStyle === ILLUSTRATION_STYLES.SATIRICAL
    ? [satiricalModel]
    : chosenStyle === ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC
      ? photographicModels
      : illustrativeModels;

  const styleLabel = ILLUSTRATION_STYLE_LABELS[chosenStyle] ?? 'Illustrative';

  if (isGenerating) {
    return (
      <Badge variant="secondary" className="h-9 px-3 bg-muted text-foreground flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Generating...
      </Badge>
    );
  }

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size={size}
                variant={variant}
                disabled={disabled}
                className="flex items-center gap-1"
              >
                <ImageIcon className="w-3 h-3" />
                <span className="hidden sm:inline">{buttonText}</span>
                <span className="sm:hidden">Cover</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">{styleLabel} style • {availableModels.length + (ENABLE_MIDJOURNEY ? midjourneyModels.length : 0)} options</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent 
          align="end" 
          className="w-80 bg-popover text-popover-foreground border shadow-lg z-50"
          sideOffset={5}
        >
          <div className="px-3 pt-2 pb-1 text-sm font-medium text-muted-foreground">Style for this story</div>
          <div className="flex flex-wrap gap-1 px-3 pb-2 border-b">
            {(Object.values(ILLUSTRATION_STYLES) as IllustrationStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={chosenStyle === s}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChosenStyle(s); }}
                className={`rounded-full border px-2 py-0.5 text-sm transition-colors ${chosenStyle === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50'}`}
              >
                {ILLUSTRATION_STYLE_LABELS[s].replace(/ \(.*\)$/, '')}{s === illustrationStyle ? ' · feed' : ''}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 text-sm text-muted-foreground border-b">
            {chosenStyle === ILLUSTRATION_STYLES.SATIRICAL ? 'Sunburst medium' : 'OpenAI GPT Image 2'} • {styleLabel}
          </div>
          {availableModels.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onModelSelect(model, chosenStyle)}
              className="p-3 cursor-pointer hover:bg-muted focus:bg-muted flex-col items-start"
            >
              <div className="flex w-full items-center justify-between mb-1">
                <span className="font-medium text-sm text-foreground">{model.name}</span>
                <span className="text-sm font-semibold text-primary">
                  {model.credits} credits
                </span>
              </div>
              {model.description && (
                <span className="text-sm text-muted-foreground">
                  {model.description}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          
          {/* MidJourney Experimental Section */}
          {ENABLE_MIDJOURNEY && (
            <>
              <DropdownMenuSeparator />
              <div className="px-3 py-2 text-sm text-attention-foreground border-b flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                MidJourney (Experimental)
              </div>
              {midjourneyModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => onModelSelect(model)}
                  className="p-3 cursor-pointer hover:bg-muted focus:bg-muted flex-col items-start"
                >
                  <div className="flex w-full items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{model.name}</span>
                      <Badge variant="outline" className="text-attention-foreground border-attention/40">
                        Beta
                      </Badge>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {model.credits} credits
                    </span>
                  </div>
                  {model.description && (
                    <span className="text-sm text-muted-foreground">
                      {model.description}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              <div className="px-3 py-2 text-sm text-muted-foreground border-t">
                ⚠️ MidJourney takes 30s-3min to generate
              </div>
            </>
          )}
          
          {illustrationStyle === ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC && (
            <div className="px-3 py-2 text-sm text-muted-foreground border-t">
              💡 Both tiers use professional photography AI models
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
};
