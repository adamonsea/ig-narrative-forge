import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoFlow } from './DemoFlow';
import { useEffect } from 'react';

interface DemoOverlayProps {
  open: boolean;
  onClose: () => void;
}

export const DemoOverlay = ({ open, onClose }: DemoOverlayProps) => {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[hsl(214,50%,5%)]/95 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Content */}
          <motion.div
            className="relative w-full max-w-4xl mx-4 md:mx-8 max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            {/* Close button */}
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white/50 hover:text-white hover:bg-white/10 rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>

            <DemoFlow isOverlay />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
