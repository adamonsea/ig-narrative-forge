import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';

interface WeekInfo {
  label: string;
  startDate: Date;
  endDate: Date;
  count: number;
}

interface WeekStackSwitcherProps {
  weeks: WeekInfo[];
  selectedIndex: number;
  onSelectWeek: (index: number) => void;
}

export function WeekStackSwitcher({ weeks, selectedIndex, onSelectWeek }: WeekStackSwitcherProps) {
  if (weeks.length <= 1) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
      <motion.div 
        className="flex gap-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-full border shadow-lg"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
      >
        {weeks.map((week, index) => (
          <motion.button
            key={index}
            onClick={() => onSelectWeek(index)}
            className={`
              relative px-3 py-1.5 rounded-full text-xs font-medium
              transition-colors duration-200
              ${selectedIndex === index 
                ? 'text-primary-foreground' 
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
            whileTap={{ scale: 0.95 }}
          >
            {/* Active indicator */}
            {selectedIndex === index && (
              <motion.div
                layoutId="weekIndicator"
                className="absolute inset-0 bg-primary rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            
            <span className="relative z-10 flex items-center gap-1.5">
              {index === 0 && <Calendar className="w-3 h-3" />}
              {week.label}
              <span className={`
                px-1.5 py-0.5 rounded-full text-[10px]
                ${selectedIndex === index 
                  ? 'bg-primary-foreground/20' 
                  : 'bg-muted'
                }
              `}>
                {week.count}
              </span>
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

// Helper to group stories by week
export function groupStoriesByWeek<T extends { created_at: string }>(stories: T[]): { week: WeekInfo; stories: T[] }[] {
  if (stories.length === 0) return [];

  const now = new Date();
  const weekGroups: Map<number, T[]> = new Map();
  
  stories.forEach(story => {
    const storyDate = new Date(story.created_at);
    const diffTime = now.getTime() - storyDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(diffDays / 7);
    
    if (!weekGroups.has(weekIndex)) {
      weekGroups.set(weekIndex, []);
    }
    weekGroups.get(weekIndex)!.push(story);
  });

  // Convert to array and create week info
  const result: { week: WeekInfo; stories: T[] }[] = [];
  
  const sortedWeeks = Array.from(weekGroups.keys()).sort((a, b) => a - b);
  
  sortedWeeks.forEach(weekIndex => {
    const weekStories = weekGroups.get(weekIndex)!;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - (weekIndex * 7) - 6);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() - (weekIndex * 7));
    
    let label: string;
    if (weekIndex === 0) {
      label = 'This Week';
    } else if (weekIndex === 1) {
      label = 'Last Week';
    } else {
      label = `${weekIndex} Weeks Ago`;
    }
    
    result.push({
      week: {
        label,
        startDate: startOfWeek,
        endDate: endOfWeek,
        count: weekStories.length
      },
      stories: weekStories
    });
  });

  return result;
}
