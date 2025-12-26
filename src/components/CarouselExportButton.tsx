import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

interface CarouselExportButtonProps {
  isExporting: boolean;
  progress: number;
  onClick: () => void;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}

export const CarouselExportButton: React.FC<CarouselExportButtonProps> = ({
  isExporting,
  progress,
  onClick,
  size = 'sm',
  variant = 'outline'
}) => {
  return (
    <Button
      size={size}
      variant={variant}
      onClick={onClick}
      disabled={isExporting}
      className="flex items-center gap-1"
    >
      {isExporting ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{progress}%</span>
        </>
      ) : (
        <>
          <Download className="w-3 h-3" />
          <span>Download for Social</span>
        </>
      )}
    </Button>
  );
};
