import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ImageIcon, Loader2 } from 'lucide-react';

export interface ImageModel {
  id: string;
  name: string;
  description: string;
  costUsd: number;
  credits: number;
  provider: string;
}

export const imageModels: ImageModel[] = [
  {
    id: 'gpt-image-1',
    name: 'Premium Quality',
    description: 'OpenAI GPT-Image-1 - Highest quality',
    costUsd: 0.06,
    credits: 10,
    provider: 'openai'
  },
  {
    id: 'dall-e-2',
    name: 'Standard Quality',
    description: 'OpenAI DALL-E 2 - Good quality, lower cost',
    costUsd: 0.02,
    credits: 3,
    provider: 'openai'
  },
  {
    id: 'flux-schnell',
    name: 'Fast Generation',
    description: 'FLUX.1-schnell via Hugging Face - Quick results',
    costUsd: 0.01,
    credits: 2,
    provider: 'huggingface'
  },
  {
    id: 'midjourney',
    name: 'Artistic Style',
    description: 'MidJourney via kie.ai - Creative artistic style',
    costUsd: 0.02,
    credits: 3,
    provider: 'midjourney'
  },
  {
    id: 'nebius-flux',
    name: 'Balanced Quality',
    description: 'FLUX via Nebius AI - Good balance of quality and speed',
    costUsd: 0.015,
    credits: 2,
    provider: 'nebius'
  }
];

interface ImageModelSelectorProps {
  onModelSelect: (model: ImageModel) => void;
  isGenerating?: boolean;
  hasExistingImage?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost' | 'link';
}

export const ImageModelSelector: React.FC<ImageModelSelectorProps> = ({
  onModelSelect,
  isGenerating = false,
  hasExistingImage = false,
  disabled = false,
  size = 'sm',
  variant = 'outline'
}) => {
  const buttonText = hasExistingImage ? 'Regenerate Cover' : 'Generate Cover';

  if (isGenerating) {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-800 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Generating...
      </Badge>
    );
  }

  if (hasExistingImage && !isGenerating) {
    return (
      <Badge variant="default" className="bg-green-100 text-green-800 flex items-center gap-1">
        <ImageIcon className="w-3 h-3" />
        Illustrated
      </Badge>
    );
  }

  return (
    <DropdownMenu>
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
      <DropdownMenuContent 
        align="end" 
        className="w-80 bg-background border shadow-lg z-50"
        sideOffset={5}
      >
        <div className="px-3 py-2 border-b">
          <h4 className="text-sm font-medium">Choose Image Generation Model</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Different models offer various quality, speed, and cost options
          </p>
        </div>
        {imageModels.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelSelect(model)}
            className="p-3 cursor-pointer hover:bg-accent focus:bg-accent flex flex-col items-start gap-1"
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{model.name}</span>
                <Badge variant="outline" className="text-xs">
                  {model.provider}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  ${model.costUsd.toFixed(3)}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {model.credits} credits
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-left w-full">
              {model.description}
            </p>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};