import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Check } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/waitlist-questionnaire`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Answers = {
  feed_kind: string[];
  feed_name: string;
  audience: string[];
  today: string[];
  resonated: string[];
  blockers: string[];
  blockers_detail: string;
  price_band: string;
  wishlist: string;
};

const EMPTY: Answers = {
  feed_kind: [],
  feed_name: '',
  audience: [],
  today: [],
  resonated: [],
  blockers: [],
  blockers_detail: '',
  price_band: '',
  wishlist: '',
};

const OPTIONS = {
  feed_kind: ['A town or area', 'An industry or beat', 'A cause or campaign', 'A hobby or scene', 'Not decided yet'],
  audience: ['My town or community', 'My members or clients', 'My industry peers', 'Just me for now'],
  today: ['Running a newsletter', 'Posting to social', 'A site or blog', 'Keeping track by hand', 'Nothing yet'],
  resonated: [
    'It does the trawling for me',
    'The finished stories and images',
    'The local focus',
    'It looks publishable',
    'I saw a feed I liked',
    'Just curious',
  ],
  blockers: [
    'Too expensive',
    "Not sure I'd trust the writing",
    'No time to run it',
    'Needs to carry my own brand',
    'Needs to sit on my own site',
    'Nothing springs to mind',
  ],
  price_band: ['Under £10', '£10–25', '£25–60', '£60+', 'Only if free'],
};

const TOTAL_STEPS = 7;

const Choice = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`w-full text-left rounded-xl border px-5 py-4 text-base transition-colors ${
      selected
        ? 'border-foreground bg-foreground text-background shadow-sm'
        : 'border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent/40'
    }`}
  >
    <span className="flex items-center justify-between gap-3">
      {label}
      {selected && <Check className="h-4 w-4 shrink-0 text-[hsl(155,100%,67%)]" aria-hidden="true" />}
    </span>
  </button>
);

export default function WaitlistWelcome() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const isPreview = token.startsWith('preview-');

  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [showDetail, setShowDetail] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Your Curatr feed — a few quick questions';
  }, []);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        const data = await res.json();
        if (!res.ok || !data.valid) {
          setState('invalid');
          return;
        }
        setEmail(data.email ?? null);
        setState('ready');
      } catch {
        setState('invalid');
      }
    })();
  }, [token]);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const toggle = (
    key: 'feed_kind' | 'resonated' | 'blockers' | 'audience' | 'today',
    value: string,
    max?: number
  ) => {
    setAnswers((a) => {
      const current = a[key];
      if (current.includes(value)) return { ...a, [key]: current.filter((v) => v !== value) };
      if (max && current.length >= max) return { ...a, [key]: [...current.slice(1), value] };
      return { ...a, [key]: [...current, value] };
    });
  };

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));

  const submit = async (wantsEarlyAccess: boolean) => {
    setSubmitting(true);
    try {
      await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, answers, wants_early_access: wantsEarlyAccess }),
      });
    } catch {
      /* answers are best-effort; never block the thank-you */
    }
    setSubmitting(false);
    setState('done');
  };

  const progress = useMemo(() => Math.min(step, TOTAL_STEPS - 1), [step]);

  if (state === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  const Brand = ({ className = '' }: { className?: string }) => (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/curatr-icon.png" alt="" aria-hidden="true" className="h-6 w-6 rounded-md" />
      <span className="text-sm font-semibold tracking-tight text-foreground">
        Curatr<span className="text-[hsl(155,100%,67%)]">.</span>
        <span className="font-light opacity-60">pro</span>
      </span>
    </span>
  );

  if (state === 'invalid') {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4 flex flex-col items-center">
          <Brand />
          <h1 className="text-2xl font-semibold text-foreground">This link has expired</h1>
          <p className="text-muted-foreground">
            Ask us for a fresh one, or take a look at a live feed in the meantime.
          </p>
          <Button asChild variant="outline">
            <Link to="/discover">Explore live feeds</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (state === 'done') {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-5 flex flex-col items-center">
          <Brand />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Thank you</h1>
          <p className="text-muted-foreground leading-relaxed">
            That's genuinely useful. We're inviting people in small batches — you'll get an email from us
            with your sign-in link when it's your turn.
          </p>
          <Button asChild>
            <Link to="/discover">See a live feed while you wait</Link>
          </Button>
          {isPreview && (
            <p className="text-xs text-muted-foreground">Preview run — this answer set is not counted.</p>
          )}
        </div>
      </main>
    );
  }

  const Screen = ({
    context,
    question,
    hint,
    children,
  }: {
    context: string;
    question: string;
    hint?: string;
    children: React.ReactNode;
  }) => (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-6"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{context}</p>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{question}</h1>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </motion.div>
  );

  return (
    <main className="min-h-dvh bg-background px-6 py-10">
      <div className="mx-auto w-full max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Curatr<span className="font-light opacity-60">.pro</span>
          </span>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i <= progress ? 'bg-foreground' : 'bg-border'}`}
              />
            ))}
          </div>
        </div>

        {isPreview && (
          <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Preview mode — nothing you enter here appears in your results.
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 0 && (
            <Screen
              context="Curatr runs a live feed on a subject or place — and you can run as many as you like."
              question="What kind of feed would you run?"
              hint="Pick more than one if you'd run several."
            >
              {OPTIONS.feed_kind.map((o) => (
                <Choice
                  key={o}
                  label={o}
                  selected={answers.feed_kind.includes(o)}
                  onClick={() => toggle('feed_kind', o)}
                />
              ))}
              {showDetail.feed_name ? (
                <Input
                  autoFocus
                  placeholder="Name it, if you like — e.g. Eastbourne"
                  value={answers.feed_name}
                  onChange={(e) => set('feed_name', e.target.value)}
                  maxLength={160}
                />
              ) : (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-4"
                  onClick={() => setShowDetail((s) => ({ ...s, feed_name: true }))}
                >
                  Add a detail
                </button>
              )}
              <Button className="w-full" disabled={answers.feed_kind.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 1 && (
            <Screen
              context="Each feed can be public, or built for a specific audience."
              question="Who's it for?"
              hint="Pick as many as apply."
            >
              {OPTIONS.audience.map((o) => (
                <Choice
                  key={o}
                  label={o}
                  selected={answers.audience.includes(o)}
                  onClick={() => toggle('audience', o)}
                />
              ))}
              <Button className="w-full" disabled={answers.audience.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 2 && (
            <Screen
              context="Curatr replaces the trawling, writing and image-making."
              question="What are you doing about it today?"
              hint="Pick as many as apply."
            >
              {OPTIONS.today.map((o) => (
                <Choice
                  key={o}
                  label={o}
                  selected={answers.today.includes(o)}
                  onClick={() => toggle('today', o)}
                />
              ))}
              <Button className="w-full" disabled={answers.today.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 3 && (
            <Screen
              context="Curatr gathers local stories, rewrites them, and illustrates them daily."
              question="What made you sign up?"
              hint="Pick up to two."
            >
              {OPTIONS.resonated.map((o) => (
                <Choice
                  key={o}
                  label={o}
                  selected={answers.resonated.includes(o)}
                  onClick={() => toggle('resonated', o, 2)}
                />
              ))}
              <Button className="w-full" disabled={answers.resonated.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 4 && (
            <Screen
              context="Honest answers here shape what we build next."
              question="What would make this a no?"
              hint="Tap any that apply."
            >
              {OPTIONS.blockers.map((o) => (
                <Choice
                  key={o}
                  label={o}
                  selected={answers.blockers.includes(o)}
                  onClick={() => toggle('blockers', o)}
                />
              ))}
              {showDetail.blockers ? (
                <Textarea
                  autoFocus
                  rows={3}
                  placeholder="Say more (optional)"
                  value={answers.blockers_detail}
                  onChange={(e) => set('blockers_detail', e.target.value)}
                  maxLength={600}
                />
              ) : (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-4"
                  onClick={() => setShowDetail((s) => ({ ...s, blockers: true }))}
                >
                  Say more
                </button>
              )}
              <Button className="w-full" onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 5 && (
            <Screen
              context="Plans aren't fixed yet — this genuinely sets the price."
              question="If it worked exactly as you hoped, what's it worth a month?"
              hint="Pick the closest band."
            >
              {OPTIONS.price_band.map((o) => (
                <Choice
                  key={o}
                  label={o}
                  selected={answers.price_band === o}
                  onClick={() => set('price_band', o)}
                />
              ))}
              <Button className="w-full" disabled={!answers.price_band} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 6 && (
            <Screen
              context="Last one, and it's optional."
              question="Anything you'd want it to do that we haven't mentioned?"
            >
              <Textarea
                rows={4}
                placeholder="Optional"
                value={answers.wishlist}
                onChange={(e) => set('wishlist', e.target.value)}
                maxLength={1000}
              />
              <Button className="w-full" onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 7 && (
            <motion.div
              key="close"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">That's everything</h1>
              <p className="text-muted-foreground leading-relaxed">
                We're opening access in small batches{email ? ` — we'll write to ${email}` : ''}. If you'd
                like to be in the first one, say so and we'll bump you up.
              </p>
              <div className="space-y-2.5">
                <Button className="w-full" disabled={submitting} onClick={() => submit(true)}>
                  I'd like early access — put me at the front
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={submitting}
                  onClick={() => submit(false)}
                >
                  Happy to wait my turn
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}