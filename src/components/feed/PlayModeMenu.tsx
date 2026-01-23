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
  siftEnabled?: boolean;
  /** When true, hides the menu entirely (for when feature is explicitly disabled) */
  hidden?: boolean;
}

export const PlayModeMenu = ({ 
  slug, 
  showPulse = false, 
  showLabel = true,
  className = '',
  siftEnabled = false,
  hidden = false
}: PlayModeMenuProps) => {
  // If explicitly hidden (metadata confirmed feature disabled), don't render
  if (hidden) return null;
  const navigate = useNavigate();

  // If sift is disabled, just show a simple button for swipe mode
  if (!siftEnabled) {
    return (
      <button
        onClick={() => navigate(`/play/${slug}`)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-all ${
          showPulse ? 'bg-primary/10 animate-pulse' : ''
        } ${className}`}
        aria-label="Play mode"
      >
        <Gamepad2 className={`w-4 h-4 transition-colors ${
          showPulse ? 'text-primary' : ''
        }`} />
        {showLabel && <span className="text-sm font-medium">Play</span>}
      </button>
    );
  }

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
      <DropdownMenuContent align="start" className="w-48 z-[60]">
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
