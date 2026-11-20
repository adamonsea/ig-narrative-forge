import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/lib/router-compat';
import { Cookie } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ensureReaderRegion, readerConsentInput, readerBanner, regionFor, markUkNoticeSeen,
  setReaderOptOut, saveAnalyticsChoice, onReaderConsentChange,
  type ReaderBanner, type ReaderConsentInput,
} from '@/lib/readerConsent';

interface CookieConsentProps {
  variant?: 'feed' | 'home' | undefined;
}

/**
 * Cookie settings: always-on Necessary, then the switches that apply where the reader is.
 * Used inside the banner and on /cookies#settings (the permanent place to change a choice).
 */
export const CookieSettingsPanel = ({ onSaved }: { onSaved?: (() => void) | undefined }) => {
  const [input, setInput] = useState<ReaderConsentInput | null>(null);
  const [anon, setAnon] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => void ensureReaderRegion().then(() => {
      if (cancelled) return;
      const i = readerConsentInput();
      setInput(i);
      if (!i) return;
      setAnon(!i.optedOut);
      setAnalytics(regionFor(i.country) === 'open' ? i.choice !== 'denied' && !i.optedOut : i.choice === 'granted');
    });
    load();
    const off = onReaderConsentChange(load);
    return () => { cancelled = true; off(); };
  }, []);

  if (!input) return <div className="h-24 rounded-lg bg-muted animate-pulse" aria-hidden />;

  const region = regionFor(input.country);
  const locked = input.gpc;

  const save = () => {
    if (region === 'uk') {
      markUkNoticeSeen();
      setReaderOptOut(!anon);
    } else if (region === 'open') {
      setReaderOptOut(!analytics);
    }
    saveAnalyticsChoice(analytics ? 'granted' : 'denied');
    setSaved(true);
    onSaved?.();
  };

  const row = (label: string, provider: string, control: ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{provider}</p>
      </div>
      {control}
    </div>
  );

  return (
    <div className="space-y-1">
      {locked && (
        <p className="text-sm text-muted-foreground pb-2">Your browser's privacy signal is on, so nothing is counted.</p>
      )}
      {row('Necessary', 'Sign-in and your choices', <span className="text-sm text-muted-foreground">Always on</span>)}
      {region === 'uk' && row(
        'Anonymous read counts',
        'Provided by Curatr',
        <Switch checked={!locked && anon} disabled={locked} onCheckedChange={setAnon} aria-label="Anonymous read counts" />,
      )}
      {row(
        region === 'uk' ? 'Analytics' : 'Reader counts and analytics',
        'Provided by Curatr and Google',
        <Switch checked={!locked && analytics} disabled={locked} onCheckedChange={setAnalytics} aria-label="Analytics" />,
      )}
      <div className="flex items-center gap-3 pt-2">
        <Button size="sm" onClick={save} disabled={locked}>Save</Button>
        {saved && <span className="text-sm text-muted-foreground" role="status">Saved</span>}
      </div>
    </div>
  );
};

export const CookieConsent = ({ variant = 'feed' }: CookieConsentProps) => {
  const [banner, setBanner] = useState<ReaderBanner>('none');
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Small delay to avoid a flash on page load
    const timer = setTimeout(() => {
      void ensureReaderRegion().then(() => {
        if (cancelled) return;
        const i = readerConsentInput();
        const b = i ? readerBanner(i) : 'none';
        if (b === 'none') return;
        if (b === 'uk-notice') markUkNoticeSeen();
        setBanner(b);
        setOpen(true);
      });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);

  const close = () => setOpen(false);
  const place = variant === 'feed' ? 'feed' : 'site';
  const isUk = banner === 'uk-notice';
  const message = isUk
    ? `We count reads anonymously to improve this ${place}.`
    : `We count visits anonymously, with nothing stored. Accept to also count return visits and use analytics cookies.`;

  const actions = isUk ? (
    <>
      <Button variant="outline" size="sm" onClick={() => { setReaderOptOut(true); close(); }}>Opt out</Button>
      <Button size="sm" onClick={close}>OK</Button>
    </>
  ) : (
    <>
      <Button variant="outline" size="sm" onClick={() => { saveAnalyticsChoice('denied'); close(); }}>Reject all</Button>
      <Button variant="outline" size="sm" onClick={() => { saveAnalyticsChoice('granted'); close(); }}>Accept all</Button>
    </>
  );

  const links = (
    <span className="text-sm text-muted-foreground">
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setShowSettings((v) => !v)}>
        Cookie settings
      </button>
      {' · '}
      <Link to="/cookies" className="underline underline-offset-2 hover:text-foreground">Learn more</Link>
    </span>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={variant === 'feed'
            ? 'fixed bottom-3 left-3 right-3 md:left-auto md:right-4 md:max-w-md z-50'
            : 'fixed bottom-0 left-0 right-0 z-50 p-4'}
        >
          <div
            ref={panelRef}
            tabIndex={-1}
            role="region"
            aria-label={isUk ? 'Reader counting' : 'Cookie choices'}
            className={variant === 'feed'
              ? 'bg-card border border-border rounded-xl shadow-md p-3 space-y-2 outline-none'
              : 'max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-3 outline-none'}
          >
            <div className={variant === 'feed' ? 'flex items-center gap-3' : 'flex flex-col md:flex-row md:items-center gap-4'}>
              {variant === 'home' && (
                <div className="bg-primary/10 rounded-full p-3 shrink-0 hidden md:block">
                  <Cookie className="h-6 w-6 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm text-foreground">{message}</p>
                {links}
              </div>
              <div className="flex gap-2 shrink-0">{actions}</div>
            </div>
            {showSettings && (
              <div className="border-t border-border pt-2">
                <CookieSettingsPanel onSaved={close} />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
