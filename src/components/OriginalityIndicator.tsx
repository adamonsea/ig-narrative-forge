import React from 'react';
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface OriginalityIndicatorProps {
  confidence: number;
  className?: string;
}

export const OriginalityIndicator: React.FC<OriginalityIndicatorProps> = ({ 
  confidence, 
  className = "" 
}) => {
  const getIndicatorConfig = (score: number) => {
    if (score >= 80) {
      return {
        variant: "default" as const,
        icon: CheckCircle2,
        text: "Original",
        color: "text-green-600"
      };
    } else if (score >= 50) {
      return {
        variant: "secondary" as const,
        icon: AlertTriangle,
        text: "Likely Original",
        color: "text-yellow-600"
      };
    } else {
      return {
        variant: "destructive" as const,
        icon: XCircle,
        text: "Potential Duplicate",
        color: "text-red-600"
      };
    }
  };

  const config = getIndicatorConfig(confidence);
  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant} 
      className={`flex items-center gap-1 ${className}`}
    >
      <Icon className="h-3 w-3" />
      {config.text}
      <span className="text-xs opacity-75">({confidence}%)</span>
    </Badge>
  );
};