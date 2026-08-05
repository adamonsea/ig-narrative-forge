import { AnimatePresence, motion } from 'framer-motion';
import { ExplainerPlayer } from './ExplainerPlayer';

interface ExplainerOverlayProps {
  open: boolean;
  onClose: () => void;
  avatarSrc?: string;
  endCta?: React.ReactNode;
}

export const ExplainerOverlay = ({ open, onClose, avatarSrc, endCta }: ExplainerOverlayProps) => (
  <AnimatePresence>
    {open && (
      <motion.div
        className="fixed inset-0 z-[70] h-[100dvh] w-screen bg-[hsl(214,50%,5%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        role="dialog"
        aria-modal="true"
        aria-label="Curatr explainer film"
      >
        <div className="h-full w-full">
          <ExplainerPlayer onClose={onClose} avatarSrc={avatarSrc} endCta={endCta} />
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default ExplainerOverlay;