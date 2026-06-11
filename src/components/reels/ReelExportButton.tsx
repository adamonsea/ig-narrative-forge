import { Button } from '@/components/ui/button';
import { Film } from 'lucide-react';

interface ReelExportButtonProps {
  onClick: () => void;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}

export const ReelExportButton = ({
  onClick,
  size = 'sm',
  variant = 'outline',
}: ReelExportButtonProps) => (
  <Button size={size} variant={variant} onClick={onClick} className="flex items-center gap-1">
    <Film className="w-3 h-3" />
    <span>Reel</span>
  </Button>
);