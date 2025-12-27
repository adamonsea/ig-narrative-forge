import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CookieConsentProps {
  variant?: 'feed' | 'home';
}

const COOKIE_CONSENT_KEY = 'cookie_consent';
const COOKIE_CONSENT_EXPIRY = 365 * 24 * 60 * 60 * 1000; // 1 year

export const CookieConsent = ({ variant = 'feed' }: CookieConsentProps) => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Small delay to avoid flash on page load
      const timer = setTimeout(() => setShowBanner(true), 500);
      return () => clearTimeout(timer);
    }
    
    // Check if consent has expired
    try {
      const { timestamp } = JSON.parse(consent);
      if (Date.now() - timestamp > COOKIE_CONSENT_EXPIRY) {
        localStorage.removeItem(COOKIE_CONSENT_KEY);
        setShowBanner(true);
      }
    } catch {
      // Invalid consent data, show banner
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      accepted: true,
      timestamp: Date.now(),
      analytics: true
    }));
    setShowBanner(false);
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({
      accepted: true,
      timestamp: Date.now(),
      analytics: false
    }));
    setShowBanner(false);
  };

  if (variant === 'feed') {
    // Minimal one-click popup for feeds
    return (
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50"
          >
            <div className="bg-card border border-border rounded-xl shadow-lg p-4">
              <div className="flex items-start gap-3">
                <Cookie className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    We use cookies to improve your experience.{' '}
                    <Link to="/cookies" className="text-primary hover:underline">
                      Learn more
                    </Link>
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button onClick={handleAccept} size="sm" className="flex-1">
                      Accept
                    </Button>
                    <Button onClick={handleReject} variant="outline" size="sm" className="flex-1">
                      Essential only
                    </Button>
                  </div>
                </div>
                <button 
                  onClick={handleReject}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // More detailed popup for home page
  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4"
        >
          <div className="max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className="bg-primary/10 rounded-full p-3 shrink-0">
                  <Cookie className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">Cookie Preferences</h3>
                  <p className="text-sm text-muted-foreground">
                    We use essential cookies to make our site work. We'd also like to use analytics cookies 
                    to understand how you use our service and improve it.{' '}
                    <Link to="/cookies" className="text-primary hover:underline">
                      Read our Cookie Policy
                    </Link>
                  </p>
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <Button onClick={handleReject} variant="outline">
                  Essential only
                </Button>
                <Button onClick={handleAccept}>
                  Accept all
                </Button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border flex gap-4 text-xs text-muted-foreground">
              <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-foreground hover:underline">Terms & Conditions</Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
