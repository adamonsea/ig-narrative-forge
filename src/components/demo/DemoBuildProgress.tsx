import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check } from 'lucide-react';

interface DemoBuildProgressProps {
  sourceName: string;
  tone: string;
  imageStyle: string;
  onComplete: () => void;
}

const STEPS = [
  { key: 'gather', label: 'Gathering stories from', duration: 3000 },
  { key: 'rewrite', label: 'AI is rewriting in your voice', duration: 4000 },
  { key: 'images', label: 'Generating cover images', duration: 3000 },
];

export const DemoBuildProgress = ({ sourceName, tone, imageStyle, onComplete }: DemoBuildProgressProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const totalDuration = STEPS.reduce((sum, s) => sum + s.duration, 0);
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 50;
      setProgress(Math.min((elapsed / totalDuration) * 100, 100));

      // Advance step
      let cumulative = 0;
      for (let i = 0; i < STEPS.length; i++) {
        cumulative += STEPS[i].duration;
        if (elapsed < cumulative) {
          setCurrentStep(i);
          break;
        }
        if (i === STEPS.length - 1) setCurrentStep(STEPS.length);
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        setTimeout(onComplete, 400);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onComplete]);

  const getStepBadge = (stepKey: string) => {
    if (stepKey === 'gather') return sourceName;
    if (stepKey === 'rewrite') return tone;
    if (stepKey === 'images') return imageStyle === 'editorial_illustrative' ? 'Illustrative' : 'Photographic';
    return '';
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <p className="text-sm uppercase tracking-widest text-[hsl(155,100%,67%)] font-medium">Step 4</p>
        <h3 className="text-2xl md:text-3xl font-display font-semibold text-white">
          Building your feed…
        </h3>
      </div>

      <div className="max-w-md mx-auto space-y-6">
        {/* Progress bar */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[hsl(270,100%,68%)] to-[hsl(155,100%,67%)] rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {STEPS.map((step, i) => {
            const isDone = currentStep > i;
            const isActive = currentStep === i;

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0.3 }}
                animate={{ opacity: isDone || isActive ? 1 : 0.3 }}
                className="flex items-center gap-3"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  isDone
                    ? 'bg-[hsl(155,100%,67%)]/20'
                    : isActive
                    ? 'bg-[hsl(270,100%,68%)]/20'
                    : 'bg-white/5'
                }`}>
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-[hsl(155,100%,67%)]" />
                  ) : isActive ? (
                    <Loader2 className="w-3.5 h-3.5 text-[hsl(270,100%,68%)] animate-spin" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  )}
                </div>
                <span className={`text-sm ${isDone || isActive ? 'text-white' : 'text-white/30'}`}>
                  {step.label}
                </span>
                <AnimatePresence>
                  {(isDone || isActive) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Badge className="bg-[hsl(270,100%,68%)]/20 text-[hsl(270,100%,68%)] border-[hsl(270,100%,68%)]/30 text-xs">
                        {getStepBadge(step.key)}
                      </Badge>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
