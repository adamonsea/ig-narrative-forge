import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/hooks/useAuth';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { CookieConsent } from '@/components/CookieConsent';
import { DemoOverlay } from '@/components/demo/DemoOverlay';
import { useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { MaskRevealHeading } from '@/components/MaskRevealHeading';

const Index = () => {
  const { user, loading } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);
  usePageFavicon();
  const reduce = useReducedMotion();

  // Subtle, editorial-friendly motion
  const ease = [0.22, 1, 0.36, 1] as const;
  const reveal: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  };
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
  };
  // Kinetic editorial reveal: words rise from behind a clipping mask
  const editorialEase = [0.19, 1, 0.22, 1] as const;
  const maskWordContainer: Variants = {
    hidden: {},
    show: { transition: { delayChildren: 0.1, staggerChildren: reduce ? 0 : 0.09 } },
  };
  const maskWord: Variants = {
    hidden: { y: reduce ? 0 : '110%', opacity: reduce ? 0 : 1 },
    show: { y: 0, opacity: 1, transition: { duration: reduce ? 0.3 : 0.9, ease: editorialEase } },
  };
  const viewport = { once: true, margin: '-80px' } as const;
  const hoverLift = reduce ? {} : { whileHover: { y: -2 }, whileTap: { y: 0 } };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(214,50%,9%)]">
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[hsl(270,80%,25%)] rounded-full blur-[150px] opacity-20" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] bg-[hsl(270,100%,68%)] rounded-full blur-[180px] opacity-10" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[hsl(155,100%,67%)] rounded-full blur-[160px] opacity-5" />
      </div>

      <div className="relative z-10">
        <header className="container mx-auto px-6 py-8">
          <nav className="flex justify-between items-center max-w-7xl mx-auto">
            <div className="text-3xl font-display font-semibold tracking-tight text-white">
              Curatr<span className="text-[hsl(155,100%,67%)]">.</span><span className="text-xl opacity-70">pro</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/discover" className="text-white/70 hover:text-white transition-colors">
                Discover
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
          </nav>
        </header>

        <main className="container mx-auto px-6">
          {/* Hero Section */}
          <section className="max-w-5xl mx-auto text-center py-24 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[hsl(270,100%,68%)]/10 blur-[120px] rounded-full -z-10" />
            <motion.div initial="hidden" animate="show" variants={container} className="space-y-8">
              <motion.h1 variants={maskWordContainer} className="text-6xl md:text-8xl font-display font-medium tracking-tight leading-[1.05] text-white">
                {['Your', 'niche', 'news', 'feed,'].map((word, i) => (
                  <span key={`l1-${i}`} className="inline-block overflow-hidden align-bottom pb-[0.18em] -mb-[0.18em] px-[0.12em] -mx-[0.12em] mr-[0.13em]">
                    <motion.span variants={maskWord} className="inline-block">
                      {word}
                    </motion.span>
                  </span>
                ))}
                <br />
                {['powered', 'by', 'AI'].map((word, i) => (
                  <span key={`l2-${i}`} className="inline-block overflow-hidden align-bottom pb-[0.18em] -mb-[0.18em] px-[0.14em] -mx-[0.14em] mr-[0.11em]">
                    <motion.span variants={maskWord} className="inline-block italic pr-[0.04em]">
                      {word}
                    </motion.span>
                  </span>
                ))}
              </motion.h1>
              <motion.p variants={reveal} className="text-xl md:text-2xl text-white/60 font-light max-w-2xl mx-auto leading-relaxed">
                Aggregate content from any source, transform it into beautiful stories, and deliver via newsletters, social carousels, or your own branded feed.
              </motion.p>
              <motion.div variants={reveal} className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <motion.div {...hoverLift}>
                  <Button asChild size="lg" className="rounded-full px-8 h-12 text-base bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                    <Link to={user ? '/dashboard' : '/auth'}>Start curating free</Link>
                  </Button>
                </motion.div>
                <motion.div {...hoverLift}>
                  <Button
                    onClick={() => setDemoOpen(true)}
                    variant="ghost"
                    size="lg"
                    className="rounded-full px-8 h-12 text-base border-2 border-[hsl(270,100%,68%)] bg-transparent text-white hover:bg-[hsl(270,100%,68%)] hover:text-white"
                  >
                    Try the demo
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          </section>

          {/* Core Value Props */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-24 border-t border-white/10"
          >
            <div className="grid md:grid-cols-3 gap-16 pt-16">
              <motion.div variants={reveal} className="space-y-4">
                <span className="block font-display text-5xl text-[hsl(155,100%,67%)] opacity-60">01</span>
                <h3 className="text-2xl font-display text-white">Aggregate anything</h3>
                <p className="text-white/50 leading-relaxed font-light">
                  Connect RSS feeds, news sites, blogs, or any web source. AI monitors and pulls relevant content 24/7, so you never miss a story.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="space-y-4">
                <span className="block font-display text-5xl text-[hsl(270,100%,68%)] opacity-60">02</span>
                <h3 className="text-2xl font-display text-white">AI-powered summaries</h3>
                <p className="text-white/50 leading-relaxed font-light">
                  Transform dry articles into engaging stories with your tone and style. Full attribution to original sources always preserved.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="space-y-4">
                <span className="block font-display text-5xl text-white/25">03</span>
                <h3 className="text-2xl font-display text-white">Multi-channel delivery</h3>
                <p className="text-white/50 leading-relaxed font-light">
                  Publish to your branded web feed, send automated newsletters, or export carousels for Instagram, LinkedIn, and more.
                </p>
              </motion.div>
            </div>
          </motion.section>

          {/* Distribution Features */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-24"
          >
            <motion.div variants={reveal} className="mb-16">
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'Reach your audience' }, { text: 'everywhere', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1]"
              />
              <p className="text-xl text-white/40 max-w-xl">
                One curation workflow, multiple distribution channels. Grow your audience on the platforms they use.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 border border-white/10">
              {[
                { label: 'Channel 01', title: 'Email newsletters', body: 'Automated daily or weekly digests sent directly to subscribers. Beautiful templates, zero manual work.' },
                { label: 'Channel 02', title: 'Social carousels', body: 'Export stories as ready-to-post image carousels for Instagram, LinkedIn, or X. Download, then post in seconds — driving traffic back to your feed.' },
                { label: 'Channel 03', title: 'Mobile-first feed', body: 'Your own branded news feed with swipe navigation, reader ratings, and instant story sharing.' },
              ].map((c) => (
                <motion.div
                  key={c.title}
                  variants={reveal}
                  className="group bg-[hsl(214,50%,9%)] p-10 hover:bg-white/[0.03] transition-colors"
                >
                  <h4 className="text-[hsl(270,100%,68%)] font-semibold uppercase tracking-widest text-xs mb-6">{c.label}</h4>
                  <h3 className="text-3xl font-display mb-4 text-white group-hover:text-[hsl(155,100%,67%)] transition-colors">{c.title}</h3>
                  <p className="text-white/50 font-light leading-relaxed">{c.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* AI & Engagement Features */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-24"
          >
            <motion.div variants={reveal} className="text-center mb-16">
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'AI tools that drive' }, { text: 'engagement', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1] flex flex-wrap justify-center"
              />
              <p className="text-xl text-white/50 max-w-2xl mx-auto">
                Go beyond curation with intelligent features that transform passive readers into active communities.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { title: 'AI illustrations', body: 'Generate unique editorial artwork for every story. No stock photos, no copyright concerns.' },
                { title: 'Play Mode', body: 'Readers swipe through stories, rating content with hot-or-not mechanics that build habits.' },
                { title: 'Quiz cards', body: 'Auto-generate knowledge quizzes from your content. Test and engage readers with gamification.' },
                { title: 'Sentiment tracking', body: 'Monitor what topics resonate with your community. See trends emerge before they go mainstream.' },
              ].map((f) => (
                <motion.div key={f.title} variants={reveal} className="border-l border-white/10 pl-8 pb-8">
                  <h4 className="text-xl font-display italic mb-4 text-white">{f.title}</h4>
                  <p className="text-sm text-white/40 leading-relaxed">{f.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Editorial Control Section */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-24 border-y border-white/10"
          >
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <motion.div variants={reveal} className="space-y-12">
                <MaskRevealHeading
                  as="h2"
                  segments={[{ text: 'You stay in' }, { text: 'control', italic: true }]}
                  className="text-5xl md:text-6xl font-display tracking-tight text-white leading-[1.1]"
                />
                <div className="space-y-8">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-tighter text-[hsl(155,100%,67%)] mb-2">01 — Editorial pipeline</h3>
                    <p className="text-white/60 font-light leading-relaxed">
                      Every story passes through your approval queue. Accept, reject, or edit before publishing.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-tighter text-[hsl(270,100%,68%)] mb-2">02 — Source attribution</h3>
                    <p className="text-white/60 font-light leading-relaxed">
                      Every story links back to the original source. Build trust with readers and publishers alike.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-tighter text-white mb-2">03 — Analytics dashboard</h3>
                    <p className="text-white/60 font-light leading-relaxed">
                      Track feed visits, newsletter opens, top stories, and source performance in real-time.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={reveal} className="bg-white/5 rounded-2xl p-8 border border-white/10">
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-2">
                  <span className="text-white/40 text-xs font-semibold uppercase tracking-widest">Pipeline overview</span>
                  <span className="text-[hsl(155,100%,67%)] text-xs font-bold">Live demo</span>
                </div>
                <div className="space-y-4 pt-4">
                  <div className="flex items-end justify-between">
                    <span className="text-white/60">Pending review</span>
                    <span className="text-3xl font-display text-[hsl(270,100%,68%)]">12</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-white/60">Published today</span>
                    <span className="text-3xl font-display text-[hsl(155,100%,67%)]">8</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-white/60">Active sources</span>
                    <span className="text-3xl font-display text-white">16</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-white/60">Newsletter subs</span>
                    <span className="text-3xl font-display text-white">142</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.section>

          {/* Demo Overlay */}
          <DemoOverlay open={demoOpen} onClose={() => setDemoOpen(false)} />

          {/* Use Cases */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            variants={container}
            className="max-w-7xl mx-auto py-24 border-t border-white/10"
          >
            <motion.div variants={reveal} className="text-center mb-16">
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'Built for' }, { text: 'curators', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white mb-4 leading-[1.1] flex flex-wrap justify-center"
              />
              <p className="text-xl text-white/50 max-w-2xl mx-auto">
                Whether you're building a local news service, industry newsletter, or community hub.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-12">
              <motion.div variants={reveal} className="p-10 bg-[hsl(214,50%,12%)] rounded-xl">
                <h3 className="text-2xl font-display text-white mb-3">Local news feeds</h3>
                <p className="text-white/50 text-sm font-light leading-relaxed">
                  Aggregate hyperlocal news from multiple sources. Perfect for town-focused digests, community newsletters, or regional news apps.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="p-10 bg-[hsl(214,50%,12%)] rounded-xl border border-[hsl(270,100%,68%)]/20">
                <h3 className="text-2xl font-display text-white mb-3">Industry newsletters</h3>
                <p className="text-white/50 text-sm font-light leading-relaxed">
                  Curate the best content from your industry. Build authority and grow a subscriber base with zero content creation overhead.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="p-10 bg-[hsl(214,50%,12%)] rounded-xl">
                <h3 className="text-2xl font-display text-white mb-3">Niche communities</h3>
                <p className="text-white/50 text-sm font-light leading-relaxed">
                  Create engaging feeds for any interest—sports, tech, culture, or hobbies. Gamification keeps readers coming back.
                </p>
              </motion.div>
            </div>
          </motion.section>

          {/* CTA Section */}
          <section className="max-w-3xl mx-auto py-24 text-center">
            {/* Roadmap */}
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={viewport}
              variants={reveal}
              className="bg-[hsl(155,100%,67%)]/5 border border-[hsl(155,100%,67%)]/20 rounded-2xl p-6 mb-12 text-left flex flex-col md:flex-row md:items-center gap-6"
            >
              <span className="px-3 py-1 bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] text-[10px] font-bold uppercase tracking-wider rounded self-start">
                On the roadmap
              </span>
              <p className="text-[hsl(155,100%,67%)] text-sm leading-relaxed font-medium">
                We're building toward native one-click publishing to social platforms (today: carousel export),
                subscriptions &amp; monetization, team workspaces, and an API. These are in development — not yet available.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={viewport}
              variants={reveal}
              className="bg-gradient-to-br from-[hsl(214,50%,12%)] to-[hsl(214,50%,9%)] rounded-[2.5rem] p-12 border border-white/10"
            >
              <MaskRevealHeading
                as="h2"
                segments={[{ text: 'Start building your' }, { text: 'feed today', italic: true }]}
                className="text-4xl md:text-5xl font-display text-white mb-4 leading-[1.1]"
              />
              <p className="text-white/50 mb-8 max-w-lg mx-auto font-light">
                Free to start. Connect your sources, curate content, and launch your first newsletter in minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <motion.div {...hoverLift}>
                  <Button asChild size="lg" className="rounded-full px-8 h-12 bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                    <Link to={user ? '/dashboard' : '/auth'}>Get started free</Link>
                  </Button>
                </motion.div>
                <Button asChild variant="ghost" size="lg" className="rounded-full px-8 h-12 text-white hover:bg-white/10">
                  <Link to="/pricing">View pricing</Link>
                </Button>
              </div>
            </motion.div>
          </section>

        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 py-8 mt-12">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/50">
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
              A{' '}
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
