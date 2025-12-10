import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Story {
  id: string;
  title: string;
  cover_illustration_url: string;
  created_at: string;
}

interface DismissedPileProps {
  stories: Story[];
  onRestore: (storyId: string) => void;
  onRestoreAll: () => void;
}

export function DismissedPile({ stories, onRestore, onRestoreAll }: DismissedPileProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (stories.length === 0) return null;

  return (
    <>
      {/* Minimized pile indicator */}
      <motion.button
        className="absolute bottom-4 right-4 z-50"
        onClick={() => setIsExpanded(true)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <div className="relative">
          {/* Stacked cards preview */}
          <div className="relative w-12 h-12">
            {stories.slice(0, 3).map((_, i) => (
              <motion.div
                key={i}
                className="absolute inset-0 bg-white rounded-sm shadow-md border"
                style={{
                  transform: `rotate(${(i - 1) * 8}deg) translateY(${-i * 2}px)`,
                  zIndex: 3 - i
                }}
              />
            ))}
            
            {/* Count badge */}
            <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center z-10">
              {stories.length}
            </div>
          </div>
          
          <span className="text-[10px] text-muted-foreground mt-1 block text-center">
            Viewed
          </span>
        </div>
      </motion.button>

      {/* Expanded modal */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              className="bg-background w-full max-w-lg rounded-t-2xl p-4 pb-8 max-h-[70vh] overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold">Viewed Stories</h3>
                  <span className="text-sm text-muted-foreground">({stories.length})</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRestoreAll}
                    className="text-xs gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore All
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsExpanded(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Grid of dismissed stories */}
              <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-[50vh]">
                {stories.map(story => (
                  <motion.button
                    key={story.id}
                    className="relative aspect-[4/3] rounded-md overflow-hidden group"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onRestore(story.id)}
                  >
                    <img
                      src={story.cover_illustration_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Restore overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <RotateCcw className="w-5 h-5 text-white" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
