import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Check } from 'lucide-react';
import { ExplainerOverlay } from '@/components/explainer/ExplainerOverlay';

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
  found_us: string;
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
  found_us: '',
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
  found_us: [
    'Search',
    'Social media',
    'A Curatr feed I came across',
    'Word of mouth',
    'Newsletter or article',
    'Somewhere else',
  ],
};

const TOTAL_STEPS = 7;

// Which step should a returning visitor land on? First one with no answer.
const firstUnansweredStep = (a: Answers) => {
  if (a.feed_kind.length === 0) return 0;
  if (a.audience.length === 0) return 1;
  if (a.today.length === 0) return 2;
  if (a.resonated.length === 0) return 3;
  if (a.blockers.length === 0 && !a.blockers_detail) return 4;
  if (!a.price_band) return 5;
  if (!a.found_us && !a.wishlist) return 6;
  return 7;
};

// "Did you know" answers to each stated objection. Objections without an
// honest answer are deliberately absent — we just thank them and move on.
const BLOCKER_ANSWERS: Record<string, string> = {
  'Too expensive':
    'Curatr runs one feed end to end for less than a couple of freelance hours a month, and there will be a free tier for a single feed while you test it.',
  "Not sure I'd trust the writing":
    'Nothing publishes itself unless you switch that on. Every story keeps its original source attached, and you can read, edit or bin it before it goes out.',
  'No time to run it':
    'The gathering, writing and illustrating happen without you. A typical day is a couple of minutes of approving or rejecting in the pipeline.',
  'Needs to carry my own brand':
    'Feeds carry your name, colours and logo — on the web feed, the email and the shareable cards.',
  'Needs to sit on my own site':
    'There is an embeddable widget and an RSS feed, so your Curatr feed can live inside your own site rather than beside it.',
};

// Full-screen statements shown between questions
const STATEMENTS: string[] = [
  'Curatr runs a live feed on a subject or place — and you can run as many as you like.',
  'Each feed can be public, or built for a specific audience.',
  'Curatr replaces the trawling, writing and image-making.',
  'Curatr gathers local stories, rewrites them, and illustrates them daily.',
  'Honest answers here shape what we build next.',
  "Plans aren't fixed yet — this genuinely sets the price.",
  'Last one — it helps us know where to spend our time.',
];

const Typewriter = ({ text, instant, onDone }: { text: string; instant?: boolean; onDone?: () => void }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
  }, [text]);

  useEffect(() => {
    if (instant) setCount(text.length);
  }, [instant, text]);

  useEffect(() => {
    if (count >= text.length) {
      onDone?.();
      return;
    }
    const char = text[count];
    // reading-speed cadence, with a natural pause on punctuation
    const delay = /[.,—?!]/.test(char) ? 220 : 34;
    const t = window.setTimeout(() => setCount((c) => c + 1), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, text]);

  return (
    // The full text is always laid out (invisible) so line breaks and word
    // positions never shift while typing — revealed characters sit on top.
    <span aria-label={text} className="relative block text-left">
      <span aria-hidden="true" className="invisible">
        {text}
      </span>
      <span aria-hidden="true" className="absolute inset-0 text-left">
        {text.slice(0, count)}
        {count < text.length && (
          <span className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.1em] bg-[hsl(155,100%,67%)] animate-pulse align-baseline" />
        )}
      </span>
    </span>
  );
};

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
    className={`w-full text-left rounded-xl border px-5 py-4 sm:px-6 sm:py-5 text-base sm:text-lg md:text-xl transition-colors ${
      selected
        ? 'border-foreground bg-foreground text-background shadow-sm'
        : 'border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent/40'
    }`}
  >
    <span className="flex items-center justify-between gap-4">
      {label}
      {selected && <Check className="h-5 w-5 shrink-0 text-[hsl(155,100%,67%)]" aria-hidden="true" />}
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
  const [phase, setPhase] = useState<'statement' | 'question'>('statement');
  const [typed, setTyped] = useState(false);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [rebuttal, setRebuttal] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [skipTyping, setSkipTyping] = useState(false);
  const [resumed, setResumed] = useState(false);

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
        if (data.answers && typeof data.answers === 'object') {
          const restored = { ...EMPTY, ...(data.answers as Partial<Answers>) };
          setAnswers(restored);
          const resume = firstUnansweredStep(restored);
          if (resume > 0) {
            setStep(Math.min(resume, TOTAL_STEPS));
            setPhase(resume >= TOTAL_STEPS ? 'question' : 'statement');
            setResumed(true);
          }
        }
        setState('ready');
      } catch {
        setState('invalid');
      }
    })();
  }, [token]);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  // Save answers progressively so partial runs are never lost.
  const savedRef = useRef('');
  useEffect(() => {
    if (state !== 'ready' || !token) return;
    const payload = JSON.stringify(answers);
    if (payload === savedRef.current || payload === JSON.stringify(EMPTY)) return;
    const t = setTimeout(() => {
      savedRef.current = payload;
      fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, answers, wants_early_access: false, partial: true }),
      }).catch(() => {
        savedRef.current = '';
      });
    }, 600);
    return () => clearTimeout(t);
  }, [answers, state, token]);

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

  const next = () => {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    setPhase('statement');
    setTyped(false);
    setSkipTyping(false);
    setRebuttal(false);
  };

  // Going back always lands on the question itself, never the statement again.
  const back = () => {
    if (rebuttal) {
      setRebuttal(false);
      return;
    }
    setStep((s) => Math.max(0, s - 1));
    setPhase('question');
    setTyped(true);
    setRebuttal(false);
  };

  const submit = async (wantsEarlyAccess: boolean) => {
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, answers, wants_early_access: wantsEarlyAccess }),
      });
      if (!res.ok) {
        setSubmitting(false);
        setSubmitError(true);
        return;
      }
    } catch {
      setSubmitting(false);
      setSubmitError(true);
      return;
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
    <span className={`inline-flex items-baseline ${className}`}>
      <span className="font-display font-semibold tracking-tight text-foreground text-2xl sm:text-3xl">
        Curatr
      </span>
      <span className="font-display font-light tracking-tight text-[hsl(155,100%,67%)] text-lg sm:text-xl">
        .pro
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
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => setExplainerOpen(true)}>Watch the 75-second tour</Button>
            <Button asChild variant="outline">
              <Link to="/discover">See a live feed while you wait</Link>
            </Button>
          </div>
          {isPreview && (
            <p className="text-xs text-muted-foreground">Preview run — this answer set is not counted.</p>
          )}
        </div>
        <ExplainerOverlay
          open={explainerOpen}
          onClose={() => setExplainerOpen(false)}
          endCta={
            <Button asChild className="rounded-full px-6">
              <Link to="/discover">See a live feed</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const Screen = ({
    question,
    hint,
    children,
  }: {
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
    className="space-y-7 sm:space-y-9"
    >
      {(step > 0 || rebuttal) && (
        <button
          type="button"
          onClick={back}
          className="text-sm sm:text-base text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Back
        </button>
      )}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground text-balance">
          {question}
        </h1>
        {hint && <p className="text-base sm:text-lg text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-3 sm:space-y-4">{children}</div>
    </motion.div>
  );

  return (
    <main className="min-h-dvh bg-background px-6 py-10 sm:py-14">
      <AnimatePresence>
        {phase === 'statement' && step < TOTAL_STEPS && (
          <motion.div
            key={`statement-${step}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="dark fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6 py-12 sm:px-10"
          >
            <div className="w-full max-w-3xl space-y-10 sm:space-y-14 text-left">
              <Brand />
              <p className="text-[clamp(1.75rem,5vw,3.75rem)] font-display font-light leading-[1.15] tracking-tight text-foreground">
                <Typewriter text={STATEMENTS[step]} onDone={() => setTyped(true)} />
              </p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: typed ? 1 : 0 }}
                transition={{ duration: 0.4 }}
              >
                <Button
                  size="lg"
                  className="min-w-56 h-14 rounded-full px-10 text-base sm:text-lg"
                  tabIndex={typed ? 0 : -1}
                  onClick={() => setPhase('question')}
                >
                  {step === 0 ? 'First question' : 'Next question'}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-lg sm:max-w-2xl space-y-8 sm:space-y-12">
        <div className="flex items-center justify-between border-b border-border/60 pb-4 sm:pb-6">
          <Brand />
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === progress
                    ? 'w-4 bg-[hsl(155,100%,67%)]'
                    : i < progress
                    ? 'w-1.5 bg-foreground'
                    : 'w-1.5 bg-border'
                }`}
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
                  className="text-base text-muted-foreground underline underline-offset-4"
                  onClick={() => setShowDetail((s) => ({ ...s, feed_name: true }))}
                >
                  Add a detail
                </button>
              )}
              <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" disabled={answers.feed_kind.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 1 && (
            <Screen
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
              <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" disabled={answers.audience.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 2 && (
            <Screen
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
              <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" disabled={answers.today.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 3 && (
            <Screen
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
              <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" disabled={answers.resonated.length === 0} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 4 && rebuttal && (
            (() => {
              const answered = answers.blockers.filter((b) => BLOCKER_ANSWERS[b]);
              return (
                <Screen
                  question={answered.length ? 'Did you know…' : 'Thanks for the feedback'}
                  hint={
                    answered.length
                      ? 'A quick word on what you flagged.'
                      : "That's noted — it goes straight to the people building this."
                  }
                >
                  {answered.map((b) => (
                    <div key={b} className="rounded-2xl border border-border bg-card px-5 py-4 sm:px-6 sm:py-5">
                      <p className="text-base sm:text-lg font-medium text-foreground">{b}</p>
                      <p className="mt-2 text-base sm:text-lg leading-relaxed text-muted-foreground">
                        {BLOCKER_ANSWERS[b]}
                      </p>
                    </div>
                  ))}
                  {answered.length > 0 && answered.length < answers.blockers.length && (
                    <p className="text-base text-muted-foreground">
                      Thanks for the rest of the feedback too — we've logged it.
                    </p>
                  )}
                  <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" onClick={next}>
                    Continue
                  </Button>
                </Screen>
              );
            })()
          )}

          {step === 4 && !rebuttal && (
            <Screen
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
                  className="text-base text-muted-foreground underline underline-offset-4"
                  onClick={() => setShowDetail((s) => ({ ...s, blockers: true }))}
                >
                  Say more
                </button>
              )}
              <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" onClick={() => setRebuttal(true)}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 5 && (
            <Screen
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
              <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" disabled={!answers.price_band} onClick={next}>
                Continue
              </Button>
            </Screen>
          )}

          {step === 6 && (
            <Screen
              question="How did you find us?"
              hint="Tap the closest one."
            >
              {OPTIONS.found_us.map((o) => (
                <Choice
                  key={o}
                  label={o}
                  selected={answers.found_us === o}
                  onClick={() => set('found_us', o)}
                />
              ))}
              <Textarea
                rows={3}
                placeholder="Anything else you'd want it to do? (optional)"
                value={answers.wishlist}
                onChange={(e) => set('wishlist', e.target.value)}
                maxLength={1000}
              />
              <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" onClick={next}>
                Finish
              </Button>
            </Screen>
          )}

          {step === 7 && (
            <motion.div
              key="close"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 sm:space-y-8"
            >
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                That's everything
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                We're opening access in small batches{email ? ` — we'll write to ${email}` : ''}. If you'd
                like to be in the first one, say so and we'll bump you up.
              </p>
              <div className="space-y-3">
                <Button size="lg" className="w-full h-14 rounded-full text-base sm:text-lg" disabled={submitting} onClick={() => submit(true)}>
                  I'd like early access — put me at the front
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full h-14 rounded-full text-base sm:text-lg"
                  disabled={submitting}
                  onClick={() => submit(false)}
                >
                  Happy to wait my turn
                </Button>
              </div>
              {submitError && (
                <p className="text-sm text-destructive">
                  We couldn't save your answers just then — please try again.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}