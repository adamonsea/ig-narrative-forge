import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ExternalLink, Settings, Trash2, Archive } from "lucide-react";

interface SourceActionsMenuProps {
  sourceId: string;
  feedUrl: string | null;
  isActive: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean | undefined;
}

export const SourceActionsMenu = ({
  sourceId,
  feedUrl,
  isActive,
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
          size="icon"
          disabled={disabled}
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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
          Edit
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={() => onToggle(!isActive)}>
          <Archive className="mr-2 h-4 w-4" />
          {isActive ? "Archive" : "Restore"}
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
