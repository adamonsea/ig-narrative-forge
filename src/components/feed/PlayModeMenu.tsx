import { Gamepad2, Layers, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PlayModeMenuProps {
  slug: string;
  showPulse?: boolean;
  showLabel?: boolean;
  className?: string;
}

export const PlayModeMenu = ({ 
  slug, 
  showPulse = false, 
  showLabel = true,
  className = ''
}: PlayModeMenuProps) => {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-all ${
            showPulse ? 'bg-primary/10 animate-pulse' : ''
          } ${className}`}
          aria-label="Play mode options"
        >
          <Gamepad2 className={`w-4 h-4 transition-colors ${
            showPulse ? 'text-primary' : ''
          }`} />
          {showLabel && <span className="text-sm font-medium">Play</span>}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem 
          onClick={() => navigate(`/play/${slug}`)}
          className="cursor-pointer"
        >
          <Gamepad2 className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Swipe</span>
            <span className="text-xs text-muted-foreground">Swipe through stories</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => navigate(`/explore/${slug}`)}
          className="cursor-pointer"
        >
          <Layers className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Sift</span>
            <span className="text-xs text-muted-foreground">Browse the photo pile</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
