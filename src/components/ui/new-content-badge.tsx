import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NewContentBadgeProps {
  show: boolean;
  count?: number;
  onDismiss?: () => void;
  className?: string;
}

export const NewContentBadge = ({ show, count, onDismiss, className }: NewContentBadgeProps) => {
  if (!show) return null;

  return (
    <Badge
      variant="default"
      className={cn(
        "settle-in bg-primary text-primary-foreground gap-1.5 cursor-pointer transition-colors",
                className
      )}
      onClick={onDismiss}
    >
      <Sparkles className="h-3 w-3" />
      <span className="text-sm font-medium">
        {count !== undefined ? `${count} new` : 'New'}
      </span>
    </Badge>
  );
};
