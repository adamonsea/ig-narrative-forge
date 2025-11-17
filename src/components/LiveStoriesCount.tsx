import { Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LiveStoriesCountProps {
  count: number;
}

export const LiveStoriesCount = ({ count }: LiveStoriesCountProps) => {
  if (count === 0) return null;
  
  return (
    <Badge variant="secondary" className="gap-1 text-xs font-normal">
      <Newspaper className="w-3 h-3" />
      {count}
    </Badge>
  );
};
