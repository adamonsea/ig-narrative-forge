import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { DemoTopicPicker } from './DemoTopicPicker';
import { DemoSourcePicker } from './DemoSourcePicker';
import { DemoStylePicker } from './DemoStylePicker';
import { DemoBuildProgress } from './DemoBuildProgress';
import { DemoFeedPreview } from './DemoFeedPreview';
import {
  type DemoTopic,
  type DemoSource,
  type DemoStyle,
  DEFAULT_DEMO_STYLE,
  DEMO_TOPIC_MAP,
} from '@/lib/demoConfig';

type DemoStep = 'topic' | 'source' | 'style' | 'build' | 'feed';

const STEP_ORDER: DemoStep[] = ['topic', 'source', 'style', 'build', 'feed'];

interface DemoFlowProps {
  isOverlay?: boolean;
}

export const DemoFlow = ({ isOverlay = false }: DemoFlowProps) => {
  const [step, setStep] = useState<DemoStep>('topic');
  const [selectedTopic, setSelectedTopic] = useState<DemoTopic | null>(null);
  const [selectedSource, setSelectedSource] = useState<DemoSource | null>(null);
  const [style, setStyle] = useState<DemoStyle>(DEFAULT_DEMO_STYLE);

  const stepIndex = STEP_ORDER.indexOf(step);

  // Resolve the real topic info from the selected demo category
  const resolvedTopic = selectedTopic
    ? DEMO_TOPIC_MAP[selectedTopic.id] || DEMO_TOPIC_MAP['local']
    : null;

  const handleTopicSelect = (topic: DemoTopic) => {
    setSelectedTopic(topic);
    // Reset source when topic changes
    setSelectedSource(null);
  };

  const handleSourceSelect = (source: DemoSource) => {
    setSelectedSource(source);
  };

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setStep(STEP_ORDER[nextIndex]);
    }
  };

  const handleBuildComplete = useCallback(() => {
    setStep('feed');
  }, []);

  const handleReset = () => {
    setStep('topic');
    setSelectedTopic(null);
    setSelectedSource(null);
    setStyle(DEFAULT_DEMO_STYLE);
  };

  const canProceed = () => {
    if (step === 'topic') return !!selectedTopic;
    if (step === 'source') return !!selectedSource;
    if (step === 'style') return true;
    return false;
  };

  const renderDots = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEP_ORDER.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === stepIndex
              ? 'w-6 bg-[hsl(270,100%,68%)]'
              : i < stepIndex
              ? 'w-1.5 bg-[hsl(155,100%,67%)]'
              : 'w-1.5 bg-white/20'
          }`}
        />
      ))}
    </div>
  );

  return (
    <section className={isOverlay ? '' : 'max-w-5xl mx-auto py-24'}>
      {!isOverlay && (
        <div className="text-center mb-10">
          <h2 className="font-display font-semibold tracking-tight text-white mb-4 text-4xl md:text-5xl">
            Try it now
          </h2>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Build a live feed in 30 seconds — no sign-up required
          </p>
        </div>
      )}

      <div className={`bg-[hsl(214,50%,11%)] rounded-3xl border border-white/10 ${isOverlay ? 'p-6 md:p-12' : 'p-6 md:p-10'}`}>
        {renderDots()}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
          >
            {step === 'topic' && (
              <DemoTopicPicker onSelect={handleTopicSelect} selected={selectedTopic?.id} />
            )}
            {step === 'source' && (
              <DemoSourcePicker
                onSelect={handleSourceSelect}
                selected={selectedSource?.id}
                topicId={selectedTopic?.id || 'local'}
              />
            )}
            {step === 'style' && (
              <DemoStylePicker style={style} onChange={setStyle} />
            )}
            {step === 'build' && (
              <DemoBuildProgress
                sourceName={selectedSource?.name || ''}
                tone={style.tone}
                imageStyle={style.imageStyle}
                onComplete={handleBuildComplete}
              />
            )}
            {step === 'feed' && resolvedTopic && (
              <DemoFeedPreview
                topicName={selectedTopic?.name || 'Your Feed'}
                topicId={resolvedTopic.topicId}
                topicSlug={resolvedTopic.slug}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {step !== 'build' && step !== 'feed' && (
          <div className="flex justify-center mt-8">
            <Button
              onClick={goNext}
              disabled={!canProceed()}
              size="lg"
              className="rounded-full px-8 bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 'feed' && (
          <div className="flex justify-center mt-6">
            <Button
              onClick={handleReset}
              variant="ghost"
              size="sm"
              className="text-white/40 hover:text-white/60 hover:bg-white/5"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Try different options
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
