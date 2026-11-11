import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/hooks/useAuth';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { CookieConsent } from '@/components/CookieConsent';
import { ExplainerOverlay } from '@/components/explainer/ExplainerOverlay';
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { MaskRevealHeading } from '@/components/MaskRevealHeading';
import { Play, ArrowRight, ChevronDown } from 'lucide-react';
import { FeatureLoop } from '@/components/home/FeatureLoops';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { FeedIdeaGenerator } from '@/components/home/FeedIdeaGenerator';
import { CuratrLogo } from '@/components/brand/CuratrLogo';
import { HomeHeroMedia } from '@/components/home/HomeHeroMedia';
import type { HomeSceneId } from '@/components/home/HomeSceneLoop';

const HomeSceneLoop = lazy(() => import('@/components/home/HomeSceneLoop'));

const HEADING = 'font-display tracking-tight leading-[1.05] text-white text-[clamp(2.75rem,6vw,5.5rem)]';
const BODY = 'text-[1.25rem] md:text-[1.5rem] leading-relaxed text-white/80 [text-wrap:pretty]';

const SceneFallback = () => (
  <div className="aspect-video w-full rounded-[2rem] border border-white/10 bg-[hsl(214,50%,7%)]" />
);

const Scene = ({ id, label }: { id: HomeSceneId; label: string }) => (
  <Suspense fallback={<SceneFallback />}>
    <HomeSceneLoop sceneId={id} label={label} />
  </Suspense>
);

const HERO_LINE_1 = 'It used to take';
const HERO_LINE_2 = 'a newsroom...';

/** Blinking typewriter caret. */
const Caret = () => (
  <motion.span
    aria-hidden="true"
    className="ml-[0.06em] inline-block h-[0.82em] w-[0.055em] translate-y-[0.08em] bg-current"
    animate={{ opacity: [1, 1, 0, 0] }}
    transition={{ duration: 1.1, repeat: Infinity, times: [0, 0.55, 0.55, 1], ease: 'linear' }}
  />
);

/**
 * Hero headline typed out character by character, like a typewriter.
 * An invisible ghost of the full text reserves the layout, so nothing
 * shifts as the typing progresses. Reduced motion shows the full text.
 */
const HeroTypewriter = () => {
  const reduce = useReducedMotion();
  const total = HERO_LINE_1.length + HERO_LINE_2.length;
  const [count, setCount] = useState(reduce ? total : 0);

  useEffect(() => {
    if (reduce || count >= total) return;
    const delay = count === 0 ? 450 : count === HERO_LINE_1.length ? 380 : 55;
    const t = window.setTimeout(() => setCount((c) => c + 1), delay);
    return () => window.clearTimeout(t);
  }, [count, reduce, total]);

  const line1 = HERO_LINE_1.slice(0, Math.min(count, HERO_LINE_1.length));
  const line2 = HERO_LINE_2.slice(0, Math.max(0, count - HERO_LINE_1.length));
  const onLine1 = count <= HERO_LINE_1.length;

  return (
    <h1
      aria-label={`${HERO_LINE_1} ${HERO_LINE_2}`}
      className="font-display font-normal tracking-tight leading-[1.04] text-white text-[clamp(3rem,9vw,7.5rem)]"
    >
      <span aria-hidden="true" className="relative block">
        {/* Ghost reserves the final layout so typing never shifts the page */}
        <span className="invisible block">
          {HERO_LINE_1}
          <br />
          <span className="italic">{HERO_LINE_2}</span>
        </span>
        <span className="absolute inset-0 block">
          {line1}
          {onLine1 && <Caret />}
          <br />
          <span className="italic">
            {line2}
            {!onLine1 && <Caret />}
          </span>
        </span>
      </span>
    </h1>
  );
};

interface SectionCopyProps {
  lead: string;
  emphasis: string;
  line: string;
  center?: boolean;
  children?: ReactNode;
}

/** One heading, one line. Fades up as it scrolls into view. */
const SectionCopy = ({ lead, emphasis, line, center, children }: SectionCopyProps) => {
  const reduce = useReducedMotion();
  return (
    <div className={center ? 'mx-auto max-w-4xl text-center' : 'max-w-xl'}>
      <MaskRevealHeading
        as="h2"
        segments={[{ text: lead }, { text: emphasis, italic: true }]}
        className={`${HEADING} ${center ? 'flex flex-wrap justify-center' : ''}`}
      />
      <motion.p
        initial={{ opacity: 0, y: reduce ? 0 : 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, delay: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={`mt-6 md:mt-8 ${BODY} ${center ? 'mx-auto max-w-2xl' : ''}`}
      >
        {line}
      </motion.p>
      {children}
    </div>
  );
};

/** Sections 2–5: text and animation side by side, alternating sides on desktop. */
const SplitSection = ({
  flip,
  copy,
  scene,
}: {
  flip?: boolean;
  copy: SectionCopyProps;
  scene: { id: HomeSceneId; label: string };
}) => (
  <section className="mx-auto flex min-h-[90svh] max-w-7xl items-center py-20 md:py-28">
    <div className="grid w-full items-center gap-12 md:grid-cols-12 md:gap-16">
      <div className={`md:col-span-5 ${flip ? 'md:order-2' : ''}`}>
        <SectionCopy {...copy} />
      </div>
      <div className={`md:col-span-7 ${flip ? 'md:order-1' : ''}`}>
        <Scene {...scene} />
      </div>
    </div>
  </section>
);

const Index = () => {
  const { user, loading } = useAuth();
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  usePageFavicon();
  const reduce = useReducedMotion();

  // Allow emails to deep-link straight into the explainer film (?explainer=1)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('explainer') === '1') {
      setExplainerOpen(true);
    }
  }, []);

  const ease = [0.22, 1, 0.36, 1] as const;
  const reveal: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  };
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
  };
  const hoverLift = reduce ? {} : { whileHover: { y: -2 }, whileTap: { y: 0 } };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const startHref = user ? '/dashboard' : '/auth';

  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-[hsl(214,50%,9%)]">
      <Helmet>
        <title>Curatr: The newsroom that runs itself</title>
        <meta name="description" content="Build and publish your own news feed on any place or subject. Curatr finds, writes, illustrates and publishes the stories, and you stay the editor." />
        <link rel="canonical" href="https://curatr.pro/" />
        <meta property="og:title" content="Curatr: The newsroom that runs itself" />
        <meta property="og:description" content="Build and publish your own news feed on any place or subject. Curatr finds, writes, illustrates and publishes the stories, and you stay the editor." />
        <meta property="og:url" content="https://curatr.pro/" />
      </Helmet>

      {/* Full-bleed hero film (or gradient placeholder) behind the header and hero */}
      <HomeHeroMedia />

      {/* Background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[hsl(270,80%,25%)] rounded-full blur-[150px] opacity-20" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] bg-[hsl(270,100%,68%)] rounded-full blur-[180px] opacity-10" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[hsl(155,100%,67%)] rounded-full blur-[160px] opacity-5" />
      </div>

      <div className="relative z-10">
        <header className="container mx-auto px-6 py-8">
          <nav className="flex justify-between items-center max-w-7xl mx-auto">
            <CuratrLogo className="text-3xl text-white" />
            <div className="hidden md:flex items-center gap-4">
              <Link to="/features" className="text-white/70 hover:text-white transition-colors">
                Features
              </Link>
              <Link to="/pricing" className="text-white/70 hover:text-white transition-colors">
                Pricing
              </Link>
              {user ? (
                <Button asChild size="lg" className="rounded-full bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <Button asChild variant="ghost" size="lg" className="rounded-full text-white hover:bg-[hsl(270,100%,68%)]/20 border border-[hsl(270,100%,68%)]/30">
                  <Link to="/auth">Sign in</Link>
                </Button>
              )}
            </div>

            {/* Mobile menu */}
            <div className="flex items-center gap-2 md:hidden">
              <Button
                asChild
                size="sm"
                className="rounded-full bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]"
              >
                <Link to={user ? '/dashboard' : '/auth'}>{user ? 'Dashboard' : 'Sign in'}</Link>
              </Button>
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className="md:hidden flex items-center justify-center h-10 w-10 rounded-full border border-white/20 text-white"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[78%] max-w-xs bg-[hsl(214,50%,9%)] border-white/10 text-white">
                <nav className="mt-10 flex flex-col gap-2">
                  {[
                    { to: '/features', label: 'Features' },
                    { to: '/pricing', label: 'Pricing' },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className="rounded-xl px-4 py-3 text-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
              </Sheet>
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-5 sm:px-6">
          {/* 1. Hero */}
          <section className="relative mx-auto flex min-h-[calc(100svh-88px)] max-w-5xl items-center justify-center pb-24 pt-6 text-center md:min-h-[calc(100svh-104px)] md:pb-28">
            <motion.div initial="hidden" animate="show" variants={container} className="w-full space-y-8 md:space-y-10">
              <HeroTypewriter />

              <motion.div variants={reveal}>
                <FeedIdeaGenerator />
              </motion.div>

              <motion.div
                variants={reveal}
                className="flex flex-col items-center justify-center gap-5 sm:flex-row sm:gap-x-12"
              >
                <button
                  type="button"
                  onClick={() => setExplainerOpen(true)}
                  className="group flex items-center gap-3 text-white/80 transition-all hover:text-white"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 transition-all group-hover:border-[hsl(155,100%,67%)] group-hover:bg-[hsl(155,100%,67%)]/10">
                    <Play
                      className="ml-0.5 h-4 w-4 fill-current text-white transition-colors group-hover:text-[hsl(155,100%,67%)]"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-lg font-medium">Watch the 60-second film</span>
                </button>
                <Link
                  to="/feed/eastbourne"
                  className="group flex items-center gap-3 text-white/80 transition-all hover:text-white"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 transition-all group-hover:border-[hsl(270,100%,68%)] group-hover:bg-[hsl(270,100%,68%)]/10">
                    <ArrowRight
                      className="h-4 w-4 text-white transition-colors group-hover:text-[hsl(270,100%,68%)]"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-lg font-medium">See a live feed</span>
                </Link>
              </motion.div>
            </motion.div>

            <a
              href="#runs-itself"
              aria-label="Scroll to learn more"
              className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-white/60 transition-colors hover:text-white"
            >
              <motion.span
                animate={reduce ? undefined : { y: [0, 6, 0] }}
                transition={reduce ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="flex"
              >
                <ChevronDown className="h-7 w-7" aria-hidden="true" />
              </motion.span>
            </a>
          </section>

          {/* 2. Sources */}
          <div id="runs-itself" className="scroll-mt-8">
            <SplitSection
              copy={{ lead: '...Now Curatr runs', emphasis: 'itself.', line: 'Curatr finds the stories for you, every day, in the background.' }}
              scene={{ id: 'sources', label: 'Sources light up one by one as the day’s article count climbs.' }}
            />
          </div>

          {/* 3. Filter */}
          <SplitSection
            flip
            copy={{ lead: 'Only what', emphasis: 'matters.', line: 'Everything irrelevant is filtered out before your readers see it.' }}
            scene={{ id: 'filter', label: 'Irrelevant stories fall away while the relevant ones drop into place.' }}
          />

          {/* 4. Written */}
          <SplitSection
            copy={{ lead: 'Written. Illustrated.', emphasis: 'Queued.', line: 'Clean, readable briefings, unified tone and pictures. Linked to its source.' }}
            scene={{ id: 'written', label: 'A story card is illustrated and its headline types itself out.' }}
          />

          {/* 5. Editor */}
          <SplitSection
            flip
            copy={{ lead: 'You’re still the', emphasis: 'editor.', line: 'Approve, edit or spike anything in seconds.' }}
            scene={{ id: 'editor', label: 'One story is approved and published while another is spiked.' }}
          />

          {/* 6. Made to be read */}
          <section className="mx-auto flex min-h-[90svh] max-w-6xl flex-col justify-center py-20 md:py-28">
            <SectionCopy
              center
              lead="Made to be"
              emphasis="read."
              line="Every story illustrated. Readers scroll, swipe of sift clippings. Add quizzes for interaction."
            />
            <div className="mx-auto mt-14 grid w-full max-w-6xl gap-10 md:mt-20 md:grid-cols-3 md:gap-10">
              {[
                { name: 'illustrations' as const, title: 'Illustrated' },
                { name: 'play' as const, title: 'Play Mode' },
                { name: 'quiz' as const, title: 'Quizzes' },
              ].map((loop) => (
                <motion.figure
                  key={loop.name}
                  initial={{ opacity: 0, y: reduce ? 0 : 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.6, ease }}
                  className="text-center"
                >
                  <div className="[zoom:1.6] md:[zoom:1.3] lg:[zoom:1.6]">
                    <FeatureLoop name={loop.name} />
                  </div>
                  <figcaption className="mt-2 font-display text-2xl italic text-white md:text-3xl">{loop.title}</figcaption>
                </motion.figure>
              ))}
            </div>
          </section>

          {/* 7. Publish */}
          <section className="mx-auto flex min-h-[90svh] max-w-6xl flex-col justify-center py-20 md:py-28">
            <SectionCopy
              center
              lead="From everywhere"
              emphasis="to everyone."
              line="Your own it all. Your feeds, a newsletter, a widget on your sites, social carousels, and ChatGPT & Claude."
            />
            <div className="mx-auto mt-14 w-full max-w-5xl md:mt-20">
              <Scene id="publish" label="One story fans out to a feed, a newsletter, a site widget and social carousels." />
            </div>
          </section>

          {/* 8. It's live */}
          <section className="mx-auto flex min-h-[80svh] max-w-5xl flex-col items-center justify-center py-20 text-center md:py-28">
            <SectionCopy
              center
              lead="It’s"
              emphasis="live."
              line="Eastbourne's feed runs on Curatr, including on the Eastbourne Chamber of Commerce website."
            >
              <motion.div {...hoverLift} className="mt-10 inline-block md:mt-12">
                <Link
                  to="/feed/eastbourne"
                  className="group inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-lg font-medium text-white transition-colors hover:border-[hsl(155,100%,67%)]/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(155,100%,67%)]"
                >
                  See the Eastbourne feed
                  <ArrowRight className="h-5 w-5 text-[hsl(155,100%,67%)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </motion.div>
            </SectionCopy>
          </section>

          {/* 9. What's your feed? */}
          <section className="mx-auto flex min-h-[90svh] max-w-5xl flex-col justify-center py-20 text-center md:py-28">
            <MaskRevealHeading
              as="h2"
              segments={[{ text: 'What’s your' }, { text: 'feed?', italic: true }]}
              className={`${HEADING} flex flex-wrap justify-center`}
            />
            <div className="mt-6 md:mt-10">
              <FeedIdeaGenerator />
            </div>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <motion.div {...hoverLift}>
                <Button asChild size="lg" className="h-14 rounded-full bg-[hsl(155,100%,67%)] px-10 text-lg font-semibold text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                  <Link to={startHref}>Start free</Link>
                </Button>
              </motion.div>
              <Button asChild variant="ghost" size="lg" className="h-14 rounded-full px-10 text-lg text-white hover:bg-white/10">
                <Link to="/pricing">View pricing</Link>
              </Button>
            </div>
          </section>

          <ExplainerOverlay
            open={explainerOpen}
            onClose={() => setExplainerOpen(false)}
            endCta={
              <Button
                asChild
                className="rounded-full bg-[hsl(155,100%,67%)] px-6 text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]"
              >
                <Link to={startHref}>Start free</Link>
              </Button>
            }
          />
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 py-8 mt-12">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/70">
          <p>
              © {new Date().getFullYear()}{' '}
              <a 
                href="https://adammd.me" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors underline underline-offset-2"
              >
                curatr.pro
              </a>
              . All rights reserved.
            </p>
            <p>
              An{' '}
              <a 
                href="https://adammd.me" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors underline underline-offset-2"
              >
                adammd.me
              </a>
              {' '}product
            </p>
          </div>
        </footer>
      </div>
      <CookieConsent variant="home" />
    </div>
  );
};

export default Index;
