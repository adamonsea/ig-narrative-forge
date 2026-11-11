import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { useAuth } from '@/hooks/useAuth';
import { CuratrLogo } from '@/components/brand/CuratrLogo';
import { FeatureScene, type FeatureSceneName } from '@/components/features/FeatureScenes';

const MINT = 'hsl(155,100%,67%)';
const VIOLET = 'hsl(270,100%,68%)';

const CHAPTERS: { id: FeatureSceneName; kicker: string; title: string; body: string }[] = [
  { id: 'gather', kicker: 'Gather', title: 'Select sources, set and forget', body: 'Journals, regulators, trade press, plus your own content. Curatr watches every source day and night.' },
  { id: 'filter', kicker: 'Filter', title: 'Only what belongs', body: 'Your topics and keywords decide what stays and what goes, reducing noise and learning.' },
  { id: 'brief', kicker: 'Brief', title: 'Long reads, made quick', body: 'Each story becomes a few swipeable slides in your tone of voice, credited to the original reporter. Or offer readers audio briefings.' },
  { id: 'illustrate', kicker: 'Illustrate', title: 'Art for every story', body: 'Original artwork or photography aligned to your brand, for the stories you select. Image style library extended frequently.' },
  { id: 'publish', kicker: 'Publish', title: 'Approve once, appear everywhere', body: 'Your feed, email briefings, website widgets and social reels, all from one tap, maximising reach and efficiency.' },
  { id: 'grow', kicker: 'Grow', title: 'Readers become subscribers', body: 'A sign-up CTAs sit in the feed. Readers become lists and your audience becomes a community' },
  { id: 'readers', kicker: 'Learn', title: 'See what lands', body: 'Reads, the headline that stops the scroll, and where readers drop off.' },
  { id: 'ask', kicker: 'Ask', title: 'Your channel, inside your AI', body: 'Connect ChatGPT or Claude to a channel and ask what’s new. Answers come from your stories, with sources.' },
];

const EXTRAS = ['Play Mode', 'Quiz cards', 'Sentiment tracking'];

const EVERYTHING = [
  { group: 'Your channel', items: ['Your own branded feed and address', 'Logo, icon and colours per feed', 'Daily and weekly roundups, plus archive', 'Widgets for any website'] },
  { group: 'Sources', items: ['RSS, sitemaps or plain web pages', 'Health checks and alerts', 'Duplicates caught automatically', 'Add your own stories'] },
  { group: 'Insight', items: ['Reads and top headline stopper', 'Drop-off across slides', 'Email opens and clicks', 'Widget views by website'] },
  { group: 'Trust', items: ['Every story credited and linked', 'Extra care on sensitive stories', 'GDPR-safe subscriber handling'] },
];

const ease = [0.22, 1, 0.36, 1] as const;
const fade = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease },
} as const;

const Features = () => {
  const { user } = useAuth();
  usePageFavicon();
  const startHref = user ? '/dashboard' : '/auth';

  return (
    <div className="min-h-dvh bg-[hsl(214,50%,9%)] text-white">
      <Helmet>
        <title>Features — Run your own niche news channel | Curatr</title>
        <meta
          name="description"
          content="Curatr gathers, filters, writes, illustrates and publishes the news in your niche, then grows your audience by email. Run one channel or a dozen, from one place."
        />
        <link rel="canonical" href="https://curatr.pro/features" />
        <meta property="og:title" content="Features — Run your own niche news channel | Curatr" />
        <meta property="og:description" content="Own the channel. Stop renting the audience. Run one niche channel or a dozen, from one place." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" aria-label="Curatr home">
            <CuratrLogo className="text-2xl text-white" />
          </Link>
          <div className="flex items-center gap-6 text-base">
            <Link to="/pricing" className="text-white/70 transition-colors hover:text-white">
              Pricing
            </Link>
            <Button asChild variant="secondary">
              <Link to={user ? '/dashboard' : '/auth'}>{user ? 'Dashboard' : 'Sign in'}</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="px-6">
        {/* Hero */}
        <section className="mx-auto max-w-4xl py-24 text-center">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">
            From everywhere <em style={{ color: MINT }}>to everyone.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-white/75 md:text-2xl">
            Own the channel. Stop renting the audience.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-auto rounded-full px-7 py-3.5 text-lg">
              <Link to={startHref}>Start free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-auto rounded-full px-7 py-3.5 text-lg">
              <Link to="/discover">See live channels</Link>
            </Button>
          </div>
        </section>

        {/* How it works — one animated scene per feature */}
        <div className="mx-auto max-w-6xl space-y-32 pb-28">
          {CHAPTERS.map((c, i) => (
            <motion.article
              key={c.id}
              {...fade}
              className={`grid items-center gap-10 md:gap-16 ${i % 2 ? 'lg:grid-cols-[1fr_1.25fr]' : 'lg:grid-cols-[1.25fr_1fr]'}`}
            >
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <FeatureScene name={c.id} />
              </div>
              <div>
                <p className="mb-3 text-base font-semibold uppercase tracking-[0.16em]" style={{ color: MINT }}>
                  {String(i + 1).padStart(2, '0')} · {c.kicker}
                </p>
                <h2 className="mb-5 font-display text-4xl italic leading-[1.05] md:text-5xl">{c.title}</h2>
                <p className="text-xl leading-relaxed text-white/75 md:text-2xl md:leading-snug">{c.body}</p>
              </div>
            </motion.article>
          ))}
        </div>

        {/* Proof */}
        <motion.section {...fade} className="mx-auto grid max-w-6xl gap-8 border-t border-white/10 py-20 md:grid-cols-2">
          <div>
            <div className="font-display text-7xl" style={{ color: MINT }}>5,600+</div>
            <p className="mt-2 text-xl text-white/75">stories published on a single feed</p>
          </div>
          <div>
            <div className="font-display text-7xl" style={{ color: VIOLET }}>Embedded</div>
            <p className="mt-2 text-xl text-white/75">Curatr widgets already run on a partner’s website</p>
          </div>
        </motion.section>

        {/* Opt-in extras */}
        <motion.section {...fade} className="mx-auto max-w-6xl border-t border-white/10 py-20">
          <h2 className="font-display text-4xl md:text-5xl">Extras, when you’re ready</h2>
          <p className="mt-3 max-w-2xl text-xl text-white/75">Off by default. Switch them on per feed.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {EXTRAS.map((e) => (
              <span key={e} className="rounded-full border border-white/20 px-5 py-2.5 text-lg">
                {e}
              </span>
            ))}
          </div>
        </motion.section>

        {/* Everything else */}
        <motion.section {...fade} className="mx-auto max-w-6xl border-t border-white/10 py-20">
          <h2 className="mb-12 font-display text-4xl md:text-5xl">And everything else</h2>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {EVERYTHING.map((g) => (
              <div key={g.group}>
                <h3 className="mb-4 text-base font-semibold uppercase tracking-[0.16em]" style={{ color: VIOLET }}>
                  {g.group}
                </h3>
                <ul className="space-y-3">
                  {g.items.map((it) => (
                    <li key={it} className="flex gap-3 text-lg leading-snug text-white/80">
                      <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={{ background: MINT }} />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl border-t border-white/10 py-24 text-center">
          <h2 className="font-display text-5xl md:text-6xl">Start your channel today</h2>
          <p className="mx-auto mt-4 max-w-2xl text-xl text-white/75">
            Free to try. Pro to publish. Credits cover artwork, cartoons, reels and audio briefings.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-auto rounded-full px-7 py-3.5 text-lg">
              <Link to={startHref}>Start free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-auto rounded-full px-7 py-3.5 text-lg">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-6xl px-6 text-base text-white/50">
          <Link to="/" className="transition-colors hover:text-white">
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default Features;
