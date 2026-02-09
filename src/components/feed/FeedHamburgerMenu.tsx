import { useState } from 'react';
import { Menu, X, HelpCircle, Filter, Calendar, CalendarDays, Archive } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedHamburgerMenuProps {
  slug: string;
  aboutPageEnabled?: boolean;
  latestDaily?: string;
  latestWeekly?: string;
  hasActiveFilters?: boolean;
  onOpenFilters: () => void;
  onClearFilters?: () => void;
  filterOptionsReady?: boolean;
  loading?: boolean;
  contentLength?: number;
}

export const FeedHamburgerMenu = ({
  slug,
  aboutPageEnabled = false,
  latestDaily,
  latestWeekly,
  hasActiveFilters = false,
  onOpenFilters,
  onClearFilters,
  filterOptionsReady = true,
  loading = false,
  contentLength = 0,
}: FeedHamburgerMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const canFilter = !loading && contentLength > 0 && filterOptionsReady;

  const menuItems = [
    {
      icon: Filter,
      label: 'Curate',
      action: 'button' as const,
      onClick: () => {
        onOpenFilters();
        setIsOpen(false);
      },
      disabled: !canFilter,
      badge: hasActiveFilters,
    },
    ...(hasActiveFilters && onClearFilters ? [{
      icon: X,
      label: 'Clear filters',
      action: 'button' as const,
      onClick: () => {
        onClearFilters();
        setIsOpen(false);
      },
    }] : []),
    {
      icon: Calendar,
      label: 'Daily Briefing',
      action: 'link' as const,
      href: `/feed/${slug}/daily/${latestDaily || 'latest'}`,
    },
    {
      icon: CalendarDays,
      label: 'Weekly Briefing',
      action: 'link' as const,
      href: `/feed/${slug}/weekly/${latestWeekly || 'latest'}`,
    },
    {
      icon: Archive,
      label: 'Archive',
      action: 'link' as const,
      href: `/feed/${slug}/archive`,
    },
    ...(aboutPageEnabled ? [{
      icon: HelpCircle,
      label: 'About',
      action: 'link' as const,
      href: `/feed/${slug}/about`,
    }] : []),
  ];

  return (
    <>
      {/* Hamburger Trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Full Screen Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Menu Content */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-0 z-[101] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="text-lg font-semibold">Menu</span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Menu Items */}
              <nav className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
                <ul className="space-y-2 max-w-xs mx-auto w-full">
                  {menuItems.map((item, index) => {
                    const content = (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 + 0.1 }}
                        className={`flex items-center justify-center gap-3 p-4 rounded-xl transition-colors ${
                          item.disabled 
                            ? 'opacity-50 cursor-not-allowed' 
                            : 'hover:bg-muted active:bg-muted/80'
                        }`}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted shrink-0">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <span className="font-medium">{item.label}</span>
                        {item.badge && (
                          <span className="w-2 h-2 bg-primary rounded-full" />
                        )}
                      </motion.div>
                    );

                    if (item.action === 'link') {
                      return (
                        <li key={item.label}>
                          <Link 
                            to={item.href!} 
                            onClick={() => setIsOpen(false)}
                            className="block"
                          >
                            {content}
                          </Link>
                        </li>
                      );
                    }

                    return (
                      <li key={item.label}>
                        <button
                          onClick={item.onClick}
                          disabled={item.disabled}
                          className="w-full text-left"
                        >
                          {content}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
