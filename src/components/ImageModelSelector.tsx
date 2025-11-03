import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ImageIcon, Loader2 } from 'lucide-react';

export interface ImageModel {
  id: string;
  name: string;
  credits: number;
  provider: string;
}

export const imageModels: ImageModel[] = [
  {
    id: 'gpt-image-1',
    name: 'Premium',
    credits: 8,
    provider: 'openai'
  },
  {
    id: 'gemini-image',
    name: 'Standard',
    credits: 1,
    provider: 'lovable-gemini'
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

  // Always show dropdown when not generating - removed the hasExistingImage check
  // This allows regeneration after deletion

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
        {imageModels.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelSelect(model)}
            className="p-3 cursor-pointer hover:bg-accent focus:bg-accent"
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-medium text-sm">{model.name}</span>
              <span className="text-xs text-muted-foreground">
                {model.credits} credits
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};