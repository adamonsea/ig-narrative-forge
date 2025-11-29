import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingTooltipProps {
  message: string;
  targetSelector: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  isVisible: boolean;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export const OnboardingTooltip = ({
  message,
  targetSelector,
  position = 'bottom',
  isVisible,
  onDismiss,
  autoDismissMs = 3000
}: OnboardingTooltipProps) => {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Calculate position relative to target element
  useEffect(() => {
    if (!isVisible) {
      setCoords(null);
      return;
    }

    const updatePosition = () => {
      const target = document.querySelector(targetSelector);
      if (!target) {
        console.log(`[OnboardingTooltip] Target not found: ${targetSelector}`);
        onDismiss();
        return;
      }

      const rect = target.getBoundingClientRect();
      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = rect.top - 8;
          left = rect.left + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + 8;
          left = rect.left + rect.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - 8;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + 8;
          break;
      }

      console.log(`[OnboardingTooltip] Position for ${targetSelector}:`, { 
        targetRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        tooltip: { top, left } 
      });
      setCoords({ top, left });
    };

    // Delay to ensure DOM is ready
    const timer = setTimeout(updatePosition, 150);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, targetSelector, position, onDismiss]);

  // Auto-dismiss
  useEffect(() => {
    if (!isVisible) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [isVisible, autoDismissMs, onDismiss]);

  const getArrowStyles = () => {
    const base = "absolute w-0 h-0 border-solid";
    switch (position) {
      case 'top':
        return `${base} bottom-[-6px] left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-foreground`;
      case 'bottom':
        return `${base} top-[-6px] left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-foreground`;
      case 'left':
        return `${base} right-[-6px] top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-foreground`;
      case 'right':
        return `${base} left-[-6px] top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-foreground`;
    }
  };

  const getTransformOrigin = () => {
    switch (position) {
      case 'top': return 'bottom center';
      case 'bottom': return 'top center';
      case 'left': return 'right center';
      case 'right': return 'left center';
    }
  };

  // Render via portal to avoid transform containment issues
  const tooltipContent = (
    <AnimatePresence>
      {isVisible && coords && (
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: coords.top,
            left: coords.left,
            transform: position === 'top' 
              ? 'translateX(-50%) translateY(-100%)' 
              : position === 'bottom'
              ? 'translateX(-50%)'
              : position === 'left'
              ? 'translateX(-100%) translateY(-50%)'
              : 'translateY(-50%)',
            transformOrigin: getTransformOrigin()
          }}
        >
          <div className="relative bg-foreground text-background px-3 py-2 rounded-lg shadow-lg max-w-[200px]">
            <p className="text-sm font-medium text-center">{message}</p>
            <div className={getArrowStyles()} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Use portal to render at document body level
  if (typeof document !== 'undefined') {
    return createPortal(tooltipContent, document.body);
  }

  return null;
};
