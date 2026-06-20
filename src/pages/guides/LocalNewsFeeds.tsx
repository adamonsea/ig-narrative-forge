import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { MaskRevealHeading } from '@/components/MaskRevealHeading';
import {
  Newspaper,
  Rss,
  Wand2,
  Share2,
  Mail,
  Image,
  TrendingUp,
  Users,
  CheckCircle2,
  ArrowRight,
  Zap,
} from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;
const viewport = { once: true, margin: '-80px' } as const;

const reveal: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const steps = [
  {
    icon: <Rss className="h-6 w-6" />,
    title: 'Curate your sources',
    body: 'Start with 8–12 trusted sources covering your area. Mix local newspapers, council bulletins, community blogs, and hyperlocal social accounts. Curatr pulls RSS feeds and monitors them automatically.',
  },
  {
    icon: <Wand2 className="h-6 w-6" />,
    title: 'Let AI simplify & rewrite',
    body: 'Raw articles are transformed into readable, engaging stories. The AI preserves every source link, so readers can always click through to the original publication.',
  },
  {
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: 'Approve in your pipeline',
    body: 'Review each story in a clean editorial queue. Accept, reject, or edit before anything goes live. You stay in full control of what your readers see.',
  },
  {
    icon: <Share2 className="h-6 w-6" />,
    title: 'Publish everywhere',
    body: 'Send newsletters, post social carousels, or let readers browse your branded web feed. One story, multiple channels — zero extra work.',
  },
];

const channels = [
  {
    icon: <Mail className="h-5 w-5" />,
    title: 'Email newsletters',
    body: 'Daily or weekly digests sent straight to subscriber inboxes. Automated, branded, and readable on any device.',
  },
  {
    icon: <Image className="h-5 w-5" />,
    title: 'Social carousels',
    body: 'Export stories as ready-to-post image carousels for Instagram, LinkedIn, and X. Drive traffic back to your feed with every swipe.',
  },
  {
    icon: <Newspaper className="h-5 w-5" />,
    title: 'Branded web feed',
    body: 'Your own mobile-first news site with swipe navigation, reader ratings, and instant story sharing. Looks like a native app.',
  },
];

const monetization = [
  {
    icon: <Zap className="h-5 w-5" />,
    title: 'Premium subscriptions',
    body: 'Offer paid tiers for exclusive content, early access, or ad-free reading. Stripe integration handles billing securely.',
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: 'Sponsored features',
    body: 'Local businesses and events pay to be highlighted in your feed. You control placement, frequency, and tone.',
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: 'Referral revenue share',
    body: 'Source publishers benefit from traffic you send. Build trust and open doors to formal revenue-sharing partnerships.',
  },
];

const keywords = [
  'niche news curation',
  'local news aggregation',
  'hyperlocal news feed',
  'AI news curation',
  'build a news feed',
  'local newsletter monetization',
  'community news platform',
];

export default function LocalNewsFeedsGuide() {
  usePageFavicon();
  const reduce = useReducedMotion();

  const motionReveal: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  };

  return (
    <div className="min-h-screen bg-[hsl(214,50%,9%)]">
      <Helmet>
        <title>How to Build & Monetize a Niche Local News Feed Using AI — Curatr</title>
        <meta
          name="description"
          content="A step-by-step guide for independent curators building hyperlocal news feeds with AI. Learn how to aggregate sources, simplify content, and monetize through newsletters and social carousels."
        />
        <link rel="canonical" href="https://curatr.pro/guides/local-news-feeds" />
        <meta
          property="og:title"
          content="How to Build & Monetize a Niche Local News Feed Using AI"
        />
        <meta
          property="og:description"
          content="A complete guide for curators building hyperlocal news feeds with AI-powered curation, multi-channel delivery, and monetization."
        />
        <meta property="og:url" content="https://curatr.pro/guides/local-news-feeds" />
        <meta property="og:type" content="article" />
        <meta name="keywords" content={keywords.join(', ')} />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'How to Build & Monetize a Niche Local News Feed Using AI',
            description:
              'A step-by-step guide for independent curators building hyperlocal news feeds with AI-powered curation and multi-channel delivery.',
            url: 'https://curatr.pro/guides/local-news-feeds',
            image: 'https://curatr.pro/curatr-icon.png',
            author: {
              '@type': 'Organization',
              name: 'Curatr',
              url: 'https://curatr.pro',
            },
            publisher: {
              '@type': 'Organization',
              name: 'Curatr',
              logo: {
                '@type': 'ImageObject',
                url: 'https://curatr.pro/curatr-icon.png',
              },
            },
            datePublished: '2026-06-20',
            dateModified: '2026-06-20',
            mainEntityOfPage: {
              '@type': 'WebPage',
              '@id': 'https://curatr.pro/guides/local-news-feeds',
            },
          })}
        </script>
      </Helmet>

      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[hsl(270,80%,25%)] rounded-full blur-[150px] opacity-20" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] bg-[hsl(270,100%,68%)] rounded-full blur-[180px] opacity-10" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[hsl(155,100%,67%)] rounded-full blur-[160px] opacity-5" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="container mx-auto px-6 py-8">
          <nav className="flex justify-between items-center max-w-7xl mx-auto">
            <Link
              to="/"
              className="text-3xl font-display font-semibold tracking-tight text-white"
            >
              Curatr<span className="text-xl opacity-70">.pro</span>
            </Link>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="rounded-full text-white hover:bg-[hsl(270,100%,68%)]/20 border border-[hsl(270,100%,68%)]/30"
            >
              <Link to="/auth">Sign in</Link>
            </Button>
          </nav>
        </header>

        <main className="container mx-auto px-6">
          {/* Hero */}
          <section className="max-w-4xl mx-auto text-center py-20 space-y-6">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={viewport}
              variants={container}
              className="space-y-6"
            >
              <motion.span
                variants={motionReveal}
                className="inline-block text-xs font-semibold uppercase tracking-widest text-[hsl(155,100%,67%)] bg-[hsl(155,100%,67%)]/10 border border-[hsl(155,100%,67%)]/20 rounded-full px-4 py-1.5"
              >
                Guide for Independent Curators
              </motion.span>
              <MaskRevealHeading
                as="h1"
                segments={[
                  { text: 'How to build a niche' },
                  { text: 'local news feed', italic: true },
                ]}
                className="text-5xl md:text-6xl font-display font-medium tracking-tight text-white leading-[1.1]"
              />
              <motion.p
                variants={motionReveal}
                className="text-xl text-white/60 font-light max-w-2xl mx-auto leading-relaxed"
              >
                A complete playbook for curators who want to aggregate, simplify, and
                monetize hyperlocal content using AI — without writing every story by hand.
              </motion.p>
            </motion.div>
          </section>

          {/* Why local news feeds matter */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-4xl mx-auto py-16 border-t border-white/10"
          >
            <motion.div variants={motionReveal} className="space-y-6">
              <h2 className="text-3xl font-display text-white">
                Why niche local news feeds are booming
              </h2>
              <div className="space-y-4 text-white/60 font-light leading-relaxed text-lg">
                <p>
                  Readers are tired of algorithmic noise. They want a single, trusted source
                  that understands their town, their industry, or their hobby. Independent
                  curators — not big media conglomerates — are filling that gap.
                </p>
                <p>
                  A niche local news feed distils dozens of sources into a concise, readable
                  digest. Think of it as a personal editor for your community: collecting
                  council updates, event listings, crime reports, and business openings, then
                  presenting them in a consistent voice your readers recognise.
                </p>
                <p>
                  The best curators do not just aggregate — they add context. A planning
                  application notice becomes a story about neighbourhood change. A retail
                  closure becomes a trend piece about the high street. That editorial layer is
                  what turns a feed into a publication.
                </p>
              </div>
            </motion.div>
          </motion.section>

          {/* 4-step process */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-16"
          >
            <motion.div variants={motionReveal} className="mb-12">
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'The 4-step curator' }, { text: 'workflow', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1]"
              />
              <p className="text-xl text-white/40 max-w-xl">
                From source selection to published story in under an hour.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-px bg-white/5 border border-white/10">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  variants={motionReveal}
                  className="bg-[hsl(214,50%,9%)] p-10 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-start gap-4 mb-6">
                    <div className="rounded-xl bg-[hsl(270,100%,68%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(270,100%,68%)]/30 shrink-0 text-[hsl(270,100%,68%)]">
                      {step.icon}
                    </div>
                    <div>
                      <span className="text-white/30 text-xs font-semibold uppercase tracking-widest block mb-1">
                        Step 0{i + 1}
                      </span>
                      <h3 className="text-2xl font-display text-white">{step.title}</h3>
                    </div>
                  </div>
                  <p className="text-white/50 font-light leading-relaxed">{step.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Multi-channel delivery */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-16 border-t border-white/10"
          >
            <motion.div variants={motionReveal} className="mb-12">
              <MaskRevealHeading
                as="h2"
                segments={[
                  { text: 'Reach your audience' },
                  { text: 'everywhere', italic: true },
                ]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1]"
              />
              <p className="text-xl text-white/40 max-w-xl">
                One curation workflow, three distribution channels. Grow where your readers
                already are.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              {channels.map((c) => (
                <motion.div
                  key={c.title}
                  variants={motionReveal}
                  className="border border-white/10 rounded-2xl p-8 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="rounded-xl bg-[hsl(155,100%,67%)]/10 w-10 h-10 flex items-center justify-center border border-[hsl(155,100%,67%)]/30 mb-6 text-[hsl(155,100%,67%)]">
                    {c.icon}
                  </div>
                  <h3 className="text-xl font-display text-white mb-3">{c.title}</h3>
                  <p className="text-white/50 font-light leading-relaxed text-sm">{c.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* AI features section */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-16"
          >
            <motion.div variants={motionReveal} className="mb-12">
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'What AI actually does' }, { text: 'for you', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1]"
              />
              <p className="text-xl text-white/40 max-w-xl">
                Automation that respects your editorial judgement.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8">
              {[
                {
                  title: 'Content simplification',
                  body: 'Long council reports and dense news articles are rewritten into punchy, readable summaries. Jargon is stripped. Key facts are preserved.',
                },
                {
                  title: 'AI illustrations',
                  body: 'Every story gets a unique editorial image. No stock-photo fatigue, no copyright risk. The visual style matches your feed’s personality.',
                },
                {
                  title: 'Auto-generated quizzes',
                  body: 'Turn stories into knowledge-check cards. Readers test what they learned, boosting engagement and time on site.',
                },
                {
                  title: 'Sentiment & trend tracking',
                  body: 'See which topics resonate before they peak. Monitor community mood around housing, transport, or local events over time.',
                },
              ].map((item) => (
                <motion.div
                  key={item.title}
                  variants={motionReveal}
                  className="border-l-2 border-[hsl(270,100%,68%)]/30 pl-8 py-2"
                >
                  <h3 className="text-lg font-display text-white mb-2">{item.title}</h3>
                  <p className="text-white/50 font-light leading-relaxed text-sm">{item.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Monetization */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-16 border-t border-white/10"
          >
            <motion.div variants={motionReveal} className="mb-12">
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'Monetize your' }, { text: 'curation', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1]"
              />
              <p className="text-xl text-white/40 max-w-xl">
                Turn editorial trust into revenue without compromising integrity.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              {monetization.map((m) => (
                <motion.div
                  key={m.title}
                  variants={motionReveal}
                  className="border border-white/10 rounded-2xl p-8 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="rounded-xl bg-[hsl(155,100%,67%)]/10 w-10 h-10 flex items-center justify-center border border-[hsl(155,100%,67%)]/30 mb-6 text-[hsl(155,100%,67%)]">
                    {m.icon}
                  </div>
                  <h3 className="text-xl font-display text-white mb-3">{m.title}</h3>
                  <p className="text-white/50 font-light leading-relaxed text-sm">{m.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Best practices */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-4xl mx-auto py-16"
          >
            <motion.div variants={motionReveal} className="space-y-8">
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'Best practices for' }, { text: 'hyperlocal feeds', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1]"
              />
              <div className="space-y-6">
                {[
                  {
                    title: 'Start narrow, then expand',
                    body: 'A feed about "Eastbourne" is too broad. A feed about "Eastbourne planning, transport, and retail" is focused enough to attract a loyal audience. You can always add topics later.',
                  },
                  {
                    title: 'Publish consistently',
                    body: 'Readers form habits around rhythm. A daily 8am digest beats a sporadic flood. Use automation to maintain consistency even when you are busy.',
                  },
                  {
                    title: 'Attribute aggressively',
                    body: 'Every story links back to its source. Not only is this legally and ethically correct, it builds trust with readers and opens partnership conversations with publishers.',
                  },
                  {
                    title: 'Engage, do not just broadcast',
                    body: 'Use Play Mode to let readers swipe and rate stories. Run quizzes. Ask for tips. The most successful feeds feel like conversations, not bulletins.',
                  },
                ].map((tip) => (
                  <div key={tip.title} className="flex gap-4">
                    <div className="mt-1.5 shrink-0">
                      <ArrowRight className="h-4 w-4 text-[hsl(155,100%,67%)]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-display text-white mb-1">{tip.title}</h3>
                      <p className="text-white/50 font-light leading-relaxed">{tip.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.section>

          {/* CTA */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-4xl mx-auto py-24 text-center border-t border-white/10"
          >
            <motion.div variants={motionReveal} className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight text-white">
                Ready to build your feed?
              </h2>
              <p className="text-xl text-white/50 max-w-xl mx-auto font-light">
                Start curating free. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-8 h-12 text-base bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]"
                >
                  <Link to="/auth">Start curating free</Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="lg"
                  className="rounded-full px-8 h-12 text-base border-2 border-[hsl(270,100%,68%)] bg-transparent text-white hover:bg-[hsl(270,100%,68%)] hover:text-white"
                >
                  <Link to="/discover">Explore feeds</Link>
                </Button>
              </div>
            </motion.div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
