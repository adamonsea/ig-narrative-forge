import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { MaskRevealHeading } from '@/components/MaskRevealHeading';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { useAuth } from '@/hooks/useAuth';
import { FeatureLoop } from '@/components/home/FeatureLoops';
import { FeatureAnimation } from '@/components/features/FeatureAnimations';
import {
  HEADLINE_FEATURES,
  DEPTH_FEATURES,
  PLATFORM_FEATURES,
} from '@/components/features/featureCatalog';

const Features = () => {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  usePageFavicon();

  const ease = [0.22, 1, 0.36, 1] as const;
  const reveal: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  };
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
  };
  const viewport = { once: true, margin: '-80px' } as const;

  return (
    <div className="min-h-dvh bg-[hsl(214,50%,9%)]">
      <Helmet>
        <title>Features — Every tool inside Curatr</title>
        <meta
          name="description"
          content="A deep dive into Curatr: source trawling, relevance filtering, AI briefings and illustrations, multi-channel publishing, analytics and full editorial control."
        />
        <link rel="canonical" href="https://curatr.pro/features" />
        <meta property="og:title" content="Features — Every tool inside Curatr" />
        <meta
          property="og:description"
          content="Source trawling, relevance filtering, AI briefings, illustrations, multi-channel publishing and full editorial control."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <header className="border-b border-white/10">
        <nav className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
          <Link to="/" className="font-display text-xl text-white">
            Curatr
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link to="/discover" className="text-white/70 hover:text-white transition-colors">
              Discover
            </Link>
            <Link to="/pricing" className="text-white/70 hover:text-white transition-colors">
              Pricing
            </Link>
            <Button asChild size="sm" variant="secondary">
              <Link to={user ? '/dashboard' : '/auth'}>{user ? 'Dashboard' : 'Sign in'}</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="px-6">
        {/* Hero */}
        <section className="max-w-4xl mx-auto py-20 text-center">
          <MaskRevealHeading
            as="h1"
            segments={[{ text: 'Everything Curatr' }, { text: 'does', italic: true }]}
            className="text-4xl md:text-6xl font-display tracking-tight text-white leading-[1.1] flex flex-wrap justify-center"
          />
          <p className="mt-6 text-lg md:text-xl text-white/70">
            A guided tour of the platform — from the moment a story is found, to the moment your
            readers see it. Each step has a short explainer below.
          </p>
        </section>

        {/* Tier 1 — headline features */}
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          variants={container}
          className="max-w-6xl mx-auto space-y-24 pb-24"
        >
          {HEADLINE_FEATURES.map((f, i) => (
            <motion.article
              key={f.id}
              variants={reveal}
              className={`grid items-center gap-10 lg:grid-cols-2 ${
                i % 2 ? 'lg:[&>*:first-child]:order-2' : ''
              }`}
            >
              <FeatureAnimation name={f.animation} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(155,100%,67%)] mb-3">
                  {f.kicker}
                </p>
                <h2 className="text-3xl md:text-4xl font-display italic text-white mb-4 leading-tight">
                  {f.title}
                </h2>
                <p className="text-white/70 leading-relaxed mb-6">{f.body}</p>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50 mb-2">
                    In brief
                  </p>
                  <p className="text-sm text-white/80 leading-relaxed">{f.script}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.section>

        {/* Tier 2 — depth features */}
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          variants={container}
          className="max-w-6xl mx-auto border-t border-white/10 py-20"
        >
          <motion.div variants={reveal} className="mb-12 max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-display text-white mb-3">
              Tools that keep readers coming back
            </h2>
            <p className="text-white/70">
              Engagement features you can switch on per feed, with no extra work.
            </p>
          </motion.div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {DEPTH_FEATURES.map((f) => (
              <motion.div key={f.id} variants={reveal} className="border-l border-white/10 pl-6">
                <FeatureLoop name={f.loop} />
                <h3 className="text-lg font-display italic text-white mb-3">{f.title}</h3>
                <p className="text-sm text-white/70 leading-relaxed">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Tier 3 — platform checklist */}
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          variants={container}
          className="max-w-6xl mx-auto border-t border-white/10 py-20"
        >
          <motion.h2 variants={reveal} className="text-3xl md:text-4xl font-display text-white mb-12">
            And everything else
          </motion.h2>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_FEATURES.map((g) => (
              <motion.div key={g.group} variants={reveal}>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-[hsl(270,100%,68%)] mb-4">
                  {g.group}
                </h3>
                <ul className="space-y-3">
                  {g.items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-white/70 leading-relaxed">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(155,100%,67%)]"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto border-t border-white/10 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-display text-white mb-6">
            Start your own feed today
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link to={user ? '/dashboard' : '/auth'}>Start curating free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/feed/eastbourne">See a feed</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-6 text-sm text-white/50">
          <Link to="/" className="hover:text-white transition-colors">
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default Features;
