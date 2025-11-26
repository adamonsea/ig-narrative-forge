import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ImageIcon, Loader2 } from 'lucide-react';
import { ILLUSTRATION_STYLES, type IllustrationStyle } from '@/lib/constants/illustrationStyles';

export interface ImageModel {
  id: string;
  name: string;
  credits: number;
  provider: string;
  description?: string;
}

// Illustrative models (editorial cartoon style)
export const illustrativeModels: ImageModel[] = [
  {
    id: 'gpt-image-1-high',
    name: 'Premium',
    credits: 10,
    provider: 'openai',
    description: 'Highest quality editorial cartoons'
  },
  {
    id: 'gpt-image-1-medium',
    name: 'Creative',
    credits: 5,
    provider: 'openai',
    description: 'Balanced quality and cost'
  },
  {
    id: 'gemini-image',
    name: 'Budget',
    credits: 1,
    provider: 'lovable-gemini',
    description: 'Fast and economical'
  }
];

// Photographic models (documentary/photojournalism style)
export const photographicModels: ImageModel[] = [
  {
    id: 'gpt-image-1-high',
    name: 'Premium',
    credits: 10,
    provider: 'openai',
    description: 'Highest quality photorealistic images'
  },
  {
    id: 'gpt-image-1-medium',
    name: 'Creative',
    credits: 5,
    provider: 'openai',
    description: 'Balanced quality and cost'
  },
  {
    id: 'gemini-image',
    name: 'Budget',
    credits: 1,
    provider: 'lovable-gemini',
    description: 'Fast and economical'
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
            <p className="text-xs">{styleLabel} style • {availableModels.length} options</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent 
          align="end" 
          className="w-80 bg-popover text-popover-foreground border shadow-lg z-50"
          sideOffset={5}
        >
          <div className="px-3 py-2 text-xs text-muted-foreground border-b">
            {styleLabel} Mode
          </div>
          {availableModels.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onModelSelect(model)}
              className="p-3 cursor-pointer hover:bg-accent focus:bg-accent flex-col items-start"
            >
              <div className="flex w-full items-center justify-between mb-1">
                <span className="font-medium text-sm">{model.name}</span>
                <span className="text-xs font-semibold text-primary">
                  {model.credits} credits
                </span>
              </div>
              {model.description && (
                <span className="text-xs text-muted-foreground">
                  {model.description}
                </span>
              )}
            </DropdownMenuItem>
          ))}
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