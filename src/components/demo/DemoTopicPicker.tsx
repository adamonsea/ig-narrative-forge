import { motion } from 'framer-motion';
import { DEMO_TOPICS, type DemoTopic } from '@/lib/demoConfig';

interface DemoTopicPickerProps {
  onSelect: (topic: DemoTopic) => void;
  selected?: string | null;
}

export const DemoTopicPicker = ({ onSelect, selected }: DemoTopicPickerProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-2xl md:text-3xl font-display font-semibold text-white">
          Pick a topic
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
        {DEMO_TOPICS.map((topic, i) => {
          const isSelected = selected === topic.id;
          const isOther = selected && !isSelected;

          return (
            <motion.button
              key={topic.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: isOther ? 0.3 : 1,
                y: 0,
                scale: isSelected ? 1.05 : 1,
              }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              onClick={() => onSelect(topic)}
              className={`relative rounded-2xl p-5 text-center transition-all border ${
                isSelected
                  ? 'bg-[hsl(270,100%,68%)]/20 border-[hsl(270,100%,68%)]/50 ring-2 ring-[hsl(270,100%,68%)]/30'
                  : 'bg-[hsl(214,50%,12%)] border-white/10 hover:border-white/20 hover:bg-[hsl(214,50%,14%)]'
              }`}
            >
              <div className="text-3xl mb-2">{topic.icon}</div>
              <div className="text-sm font-semibold text-white">{topic.name}</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
