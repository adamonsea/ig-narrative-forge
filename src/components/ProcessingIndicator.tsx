import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface ProcessingIndicatorProps {
  isProcessing: boolean;
  queuePosition?: number;
  estimatedTime?: string;
}

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({
  isProcessing,
  queuePosition,
  estimatedTime
}) => {
  if (!isProcessing) return null;

  return (
    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-blue-800">
          Content Generation in Progress
        </span>
        <div className="flex items-center gap-2 text-xs text-blue-600">
          {queuePosition && (
            <Badge variant="outline" className="text-xs">
              Queue Position: {queuePosition}
            </Badge>
          )}
          {estimatedTime && (
            <span>Estimated: {estimatedTime}</span>
          )}
        </div>
      </div>
    </div>
  );
};