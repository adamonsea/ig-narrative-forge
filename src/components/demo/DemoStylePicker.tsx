import { motion } from 'framer-motion';
import {
  TONE_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  type DemoTone,
  type DemoImageStyle,
  type DemoStyle,
} from '@/lib/demoConfig';
import { Palette, Type } from 'lucide-react';

interface DemoStylePickerProps {
  style: DemoStyle;
  onChange: (style: DemoStyle) => void;
}

export const DemoStylePicker = ({ style, onChange }: DemoStylePickerProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-sm uppercase tracking-widest text-[hsl(155,100%,67%)] font-medium">Step 3</p>
        <h3 className="text-2xl md:text-3xl font-display font-semibold text-white">
          Set your style
        </h3>
        <p className="text-white/50 text-sm">Choose a voice and visual direction</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-md mx-auto space-y-6"
      >
        {/* Tone */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-white/60 text-sm font-medium">
            <Type className="w-4 h-4" />
            <span>Tone</span>
          </div>
          <div className="flex gap-2">
            {TONE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onChange({ ...style, tone: opt.value })}
                className={`flex-1 rounded-xl py-2.5 px-3 text-sm font-medium transition-all border ${
                  style.tone === opt.value
                    ? 'bg-[hsl(270,100%,68%)]/20 border-[hsl(270,100%,68%)]/50 text-white'
                    : 'bg-[hsl(214,50%,12%)] border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Image Style */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-white/60 text-sm font-medium">
            <Palette className="w-4 h-4" />
            <span>Image style</span>
          </div>
          <div className="flex gap-2">
            {IMAGE_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onChange({ ...style, imageStyle: opt.value })}
                className={`flex-1 rounded-xl py-2.5 px-3 text-sm font-medium transition-all border ${
                  style.imageStyle === opt.value
                    ? 'bg-[hsl(155,100%,67%)]/20 border-[hsl(155,100%,67%)]/50 text-white'
                    : 'bg-[hsl(214,50%,12%)] border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
