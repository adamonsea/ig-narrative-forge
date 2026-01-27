import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { ILLUSTRATION_STYLES, type IllustrationStyle } from '@/lib/constants/illustrationStyles';

// ============================================================
// FEATURE FLAG: MidJourney Experimental Mode
// Set to false to hide MidJourney options from the dropdown
// ============================================================
const ENABLE_MIDJOURNEY = true;

export interface ImageModel {
  id: string;
  name: string;
  credits: number;
  provider: string;
  description?: string;
  experimental?: boolean;
}

// Illustrative models (editorial cartoon style) - GPT Image 1.5
export const illustrativeModels: ImageModel[] = [
  {
    id: 'gpt-image-1.5-high',
    name: 'Premium',
    credits: 8,
    provider: 'openai',
    description: 'Highest quality editorial cartoons (GPT-Image-1.5)'
  },
  {
    id: 'gpt-image-1.5-medium',
    name: 'Creative',
    credits: 4,
    provider: 'openai',
    description: 'Balanced quality and cost (GPT-Image-1.5)'
  },
  {
    id: 'gpt-image-1.5-low',
    name: 'Quick',
    credits: 2,
    provider: 'openai',
    description: 'Fast generation, good quality (GPT-Image-1.5)'
  }
];

// Photographic models (documentary/photojournalism style) - GPT Image 1.5
export const photographicModels: ImageModel[] = [
  {
    id: 'gpt-image-1.5-high',
    name: 'Premium',
    credits: 8,
    provider: 'openai',
    description: 'Highest quality photorealistic images (GPT-Image-1.5)'
  },
  {
    id: 'gpt-image-1.5-medium',
    name: 'Creative',
    credits: 4,
    provider: 'openai',
    description: 'Balanced quality and cost (GPT-Image-1.5)'
  },
  {
    id: 'gpt-image-1.5-low',
    name: 'Quick',
    credits: 2,
    provider: 'openai',
    description: 'Fast generation, good quality (GPT-Image-1.5)'
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

interface ImageModelSelectorProps {
  onModelSelect: (model: ImageModel) => void;
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

  // Select appropriate model list based on illustration style
  const availableModels = illustrationStyle === ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC
    ? photographicModels
    : illustrativeModels;

  const styleLabel = illustrationStyle === ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC
    ? 'Photographic'
    : 'Illustrative';

  if (isGenerating) {
    return (
      <Badge variant="secondary" className="h-8 px-3 bg-blue-100 text-blue-800 flex items-center gap-1">
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
            <p className="text-xs">{styleLabel} style • {availableModels.length + (ENABLE_MIDJOURNEY ? midjourneyModels.length : 0)} options</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent 
          align="end" 
          className="w-80 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border shadow-lg z-50"
          sideOffset={5}
        >
          <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-b">
            OpenAI GPT Image 1.5 • {styleLabel} Mode
          </div>
          {availableModels.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onModelSelect(model)}
              className="p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 flex-col items-start"
            >
              <div className="flex w-full items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{model.name}</span>
                <span className="text-xs font-semibold text-primary">
                  {model.credits} credits
                </span>
              </div>
              {model.description && (
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {model.description}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          
          {/* MidJourney Experimental Section */}
          {ENABLE_MIDJOURNEY && (
            <>
              <DropdownMenuSeparator />
              <div className="px-3 py-2 text-xs text-amber-600 dark:text-amber-400 border-b flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                MidJourney (Experimental)
              </div>
              {midjourneyModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => onModelSelect(model)}
                  className="p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 flex-col items-start"
                >
                  <div className="flex w-full items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{model.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">
                        Beta
                      </Badge>
                    </div>
                    <span className="text-xs font-semibold text-primary">
                      {model.credits} credits
                    </span>
                  </div>
                  {model.description && (
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {model.description}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                ⚠️ MidJourney takes 30s-3min to generate
              </div>
            </>
          )}
          
          {illustrationStyle === ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t">
              💡 Both tiers use professional photography AI models
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
};
