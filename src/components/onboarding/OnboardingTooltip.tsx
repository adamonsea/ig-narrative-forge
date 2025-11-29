import { useEffect, useState, useRef } from 'react';
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
    if (!isVisible) return;

    const updatePosition = () => {
      const target = document.querySelector(targetSelector);
      if (!target) {
        // If target not found, dismiss this tooltip
        onDismiss();
        return;
      }

      const rect = target.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = rect.top + scrollY - 8;
          left = rect.left + scrollX + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + scrollY + 8;
          left = rect.left + scrollX + rect.width / 2;
          break;
        case 'left':
          top = rect.top + scrollY + rect.height / 2;
          left = rect.left + scrollX - 8;
          break;
        case 'right':
          top = rect.top + scrollY + rect.height / 2;
          left = rect.right + scrollX + 8;
          break;
      }

      setCoords({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
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

  if (!coords) return null;

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

  const getTransform = () => {
    switch (position) {
      case 'top':
        return 'translateX(-50%) translateY(-100%)';
      case 'bottom':
        return 'translateX(-50%)';
      case 'left':
        return 'translateX(-100%) translateY(-50%)';
      case 'right':
        return 'translateY(-50%)';
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="fixed z-[100] pointer-events-none"
          style={{
            top: coords.top,
            left: coords.left,
            transform: getTransform()
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
};
