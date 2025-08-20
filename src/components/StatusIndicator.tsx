import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'success' | 'pending' | 'error' | 'warning';
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusIndicator({ status, text, size = 'md' }: StatusIndicatorProps) {
  const getIcon = () => {
    const iconProps = {
      className: size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
    };

    switch (status) {
      case 'success':
        return <CheckCircle {...iconProps} className={`${iconProps.className} text-green-500`} />;
      case 'pending':
        return <Clock {...iconProps} className={`${iconProps.className} text-yellow-500 animate-pulse`} />;
      case 'error':
        return <XCircle {...iconProps} className={`${iconProps.className} text-red-500`} />;
      case 'warning':
        return <AlertCircle {...iconProps} className={`${iconProps.className} text-orange-500`} />;
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