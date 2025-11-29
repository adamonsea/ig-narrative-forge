import { useEffect, useState } from 'react';
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

      // Simple positioning: center horizontally, offset vertically
      const gap = 8; // Gap between target and tooltip
      
      switch (position) {
        case 'top':
          top = rect.top - gap;
          left = rect.left + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + gap;
          left = rect.left + rect.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - gap;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + gap;
          break;
      }

      console.log(`[OnboardingTooltip] ${targetSelector}:`, { 
        rect: { top: rect.top, left: rect.left, width: rect.width, bottom: rect.bottom },
        calculated: { top, left } 
      });
      setCoords({ top, left });
    };

    // Delay to ensure DOM is ready
    const timer = setTimeout(updatePosition, 200);
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

  // Get transform based on position (to center the tooltip)
  const getTransform = () => {
    switch (position) {
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
    }
  };

  const tooltipContent = (
    <AnimatePresence>
      {isVisible && coords && (
        <motion.div
          initial={{ opacity: 0, y: position === 'bottom' ? -5 : position === 'top' ? 5 : 0, x: position === 'left' ? 5 : position === 'right' ? -5 : 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: getTransform(),
            zIndex: 99999,
            pointerEvents: 'none',
          }}
        >
          <div className="bg-foreground text-background px-3 py-2 rounded-lg shadow-xl max-w-[220px] text-center">
            <p className="text-sm font-medium">{message}</p>
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
