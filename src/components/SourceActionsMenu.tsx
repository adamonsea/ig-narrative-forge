import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, RotateCw, ExternalLink, Settings, Trash2 } from "lucide-react";

interface SourceActionsMenuProps {
  sourceId: string;
  feedUrl: string | null;
  isActive: boolean;
  onForceRescrape: () => void;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

export const SourceActionsMenu = ({
  sourceId,
  feedUrl,
  isActive,
  onForceRescrape,
  onToggle,
  onEdit,
  onDelete,
  disabled
}: SourceActionsMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onForceRescrape} disabled={!feedUrl || disabled}>
          <RotateCw className="mr-2 h-4 w-4" />
          Force Rescrape
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => onToggle(!isActive)}>
          {isActive ? "Disable Source" : "Enable Source"}
        </DropdownMenuItem>
        
        {feedUrl && (
          <DropdownMenuItem asChild>
            <a href={feedUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Visit URL
            </a>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={onEdit}>
          <Settings className="mr-2 h-4 w-4" />
          Edit Settings
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Source
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
