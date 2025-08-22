import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'success' | 'pending' | 'error' | 'warning';
  text?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function StatusIndicator({ status, text, size = 'md' }: StatusIndicatorProps) {
  const getIcon = () => {
    const dotSize = size === 'xs' ? 'h-1.5 w-1.5' : size === 'sm' ? 'h-2 w-2' : size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5';
    const iconSize = size === 'xs' ? 'h-2 w-2' : size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

    switch (status) {
      case 'success':
        return <div className={`${dotSize} rounded-full border-2 border-green-500`} />;
      case 'pending':
        return <Clock className={`${iconSize} text-yellow-500 animate-pulse`} />;
      case 'error':
        return <div className={`${dotSize} rounded-full border-2 border-red-500`} />;
      case 'warning':
        return <AlertCircle className={`${iconSize} text-orange-500`} />;
      default:
        return null;
    }
  };

  const getVariant = () => {
    switch (status) {
      case 'success':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'error':
        return 'destructive';
      case 'warning':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <Badge variant={getVariant()} className="flex items-center gap-1">
      {getIcon()}
      {text && <span className="text-xs">{text}</span>}
    </Badge>
  );
}

export default StatusIndicator;