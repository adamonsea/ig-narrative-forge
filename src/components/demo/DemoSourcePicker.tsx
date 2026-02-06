import { motion } from 'framer-motion';
import { DEMO_SOURCES, type DemoSource } from '@/lib/demoConfig';
import { Globe, Check } from 'lucide-react';

interface DemoSourcePickerProps {
  onSelect: (source: DemoSource) => void;
  selected?: string | null;
  topicName: string;
}

export const DemoSourcePicker = ({ onSelect, selected, topicName }: DemoSourcePickerProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-sm uppercase tracking-widest text-[hsl(155,100%,67%)] font-medium">Step 2</p>
        <h3 className="text-2xl md:text-3xl font-display font-semibold text-white">
          Pick a source
        </h3>
        <p className="text-white/50 text-sm">Choose where to gather stories from</p>
      </div>

      <div className="flex flex-col gap-3 max-w-md mx-auto">
        {DEMO_SOURCES.map((source, i) => {
          const isSelected = selected === source.id;

          return (
            <motion.button
              key={source.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              onClick={() => onSelect(source)}
              className={`flex items-center gap-4 rounded-xl px-5 py-4 text-left transition-all border ${
                isSelected
                  ? 'bg-[hsl(270,100%,68%)]/20 border-[hsl(270,100%,68%)]/50'
                  : 'bg-[hsl(214,50%,12%)] border-white/10 hover:border-white/20'
              }`}
            >
              <div className={`rounded-lg w-10 h-10 flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-[hsl(270,100%,68%)]/20' : 'bg-white/5'
              }`}>
                {isSelected ? (
                  <Check className="w-5 h-5 text-[hsl(270,100%,68%)]" />
                ) : (
                  <Globe className="w-5 h-5 text-white/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{source.name}</div>
                <div className="text-xs text-white/40">{source.domain}</div>
              </div>
              <div className="text-xs text-white/30 font-mono">{source.articleCount.toLocaleString()} articles</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
