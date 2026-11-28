import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/lib/router-compat';
import {
  ensureReaderRegion, readerConsentInput, readerBanner, regionFor, markUkNoticeSeen,
  saveReaderChoices, onReaderConsentChange,
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
    if (region === 'uk') markUkNoticeSeen();
    saveReaderChoices(analytics, region === 'uk' ? anon : analytics);
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
        <p className="text-sm text-muted-foreground pb-2">Your browser's privacy signal keeps optional tracking off.</p>
      )}
      {row('Necessary', 'Sign-in and your choices', <span className="text-sm text-muted-foreground">Always on</span>)}
      {region === 'uk' && row(
        'Anonymous read counts',
        'Provided by Curatr',
        <Switch checked={!locked && anon} disabled={locked} onCheckedChange={setAnon} aria-label="Anonymous read counts" />,
      )}
      {row(
        region === 'uk' ? 'Analytics cookies' : 'Reader counts and analytics',
        'Provided by Curatr, Lovable and Google',
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

  useEffect(() => onReaderConsentChange(() => {
    const input = readerConsentInput();
    if (input && (input.gpc || input.choice !== null)) setOpen(false);
  }), []);

  const close = () => setOpen(false);
  const isUk = banner === 'uk-notice';
  const message = isUk
    ? 'We count reads anonymously. Accept for analytics cookies, or choose Essential only to stop reader counting. Anonymous page visits still count.'
    : 'Accept for reader counts and analytics cookies. Essential only keeps these off. Anonymous page visits still count.';

  const actions = (
    <>
      <Button variant="outline" className="flex-1 text-sm" onClick={() => { saveReaderChoices(false); close(); }}>Essential only</Button>
      <Button variant="outline" className="flex-1 text-sm" onClick={() => { saveReaderChoices(true); close(); }}>Accept all</Button>
    </>
  );

  const links = (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <Button variant="link" className="h-11 px-0 text-sm text-muted-foreground" aria-expanded={showSettings} aria-controls="banner-cookie-settings" onClick={() => setShowSettings((v) => !v)}>
        Customise
      </Button>
      <Link to="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground">Privacy policy</Link>
    </div>
  );

  return (
    <>
      {open && (
        <div
          className={variant === 'feed'
            ? 'fixed bottom-3 left-3 right-3 md:left-auto md:right-4 md:max-w-md z-50'
            : 'fixed bottom-0 left-0 right-0 z-50 p-4'}
        >
          <div
            ref={panelRef}
            tabIndex={-1}
            role="region"
            aria-label="Cookie choices"
            className="max-w-4xl mx-auto bg-card text-foreground border border-border rounded-lg shadow-md p-4 space-y-2 outline-none max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className={variant === 'feed' ? 'space-y-2' : 'flex flex-col md:flex-row md:items-center gap-4'}>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm text-foreground">{message}</p>
                {links}
              </div>
              <div className="grid grid-cols-2 gap-2 shrink-0 md:min-w-72">{actions}</div>
            </div>
            {showSettings && (
              <div id="banner-cookie-settings" className="border-t border-border pt-2">
                <CookieSettingsPanel onSaved={close} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
