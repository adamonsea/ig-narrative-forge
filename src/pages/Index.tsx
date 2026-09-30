import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/hooks/useAuth';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { CookieConsent } from '@/components/CookieConsent';
import { DemoOverlay } from '@/components/demo/DemoOverlay';
import { ExplainerOverlay } from '@/components/explainer/ExplainerOverlay';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { MaskRevealHeading } from '@/components/MaskRevealHeading';
import { Play, ArrowRight } from 'lucide-react';
import { FeatureLoop, type FeatureLoopName } from '@/components/home/FeatureLoops';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { FeedIdeaGenerator } from '@/components/home/FeedIdeaGenerator';
import { CuratrLogo } from '@/components/brand/CuratrLogo';

const Index = () => {
  const { user, loading } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);
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
      <Helmet>
        <title>Curatr: AI-Powered News Feed Curation</title>
        <meta name="description" content="Build and publish your own niche news feeds. Curatr uses AI to gather, rewrite, and curate stories with strong source attribution." />
        <link rel="canonical" href="https://curatr.pro/" />
        <meta property="og:title" content="Curatr: AI-Powered News Feed Curation" />
        <meta property="og:description" content="Build and publish your own niche news feeds with AI-assisted curation and strong source attribution." />
        <meta property="og:url" content="https://curatr.pro/" />
      </Helmet>
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[hsl(270,80%,25%)] rounded-full blur-[150px] opacity-20" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] bg-[hsl(270,100%,68%)] rounded-full blur-[180px] opacity-10" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[hsl(155,100%,67%)] rounded-full blur-[160px] opacity-5" />
      </div>

      <div className="relative z-10">
        <header className="container mx-auto px-6 py-8">
          <nav className="flex justify-between items-center max-w-7xl mx-auto">
            <CuratrLogo className="text-3xl text-white" />
            <div className="hidden md:flex items-center gap-4">
              <Link to="/discover" className="text-white/70 hover:text-white transition-colors">
                Discover
              </Link>
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
                    { to: '/discover', label: 'Discover' },
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

        <main className="container mx-auto px-4 sm:px-6">
          {/* Hero Section */}
          <section className="relative mx-auto flex min-h-[calc(100svh-88px)] max-w-5xl items-center justify-center py-8 text-center md:min-h-[calc(100svh-104px)] md:py-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[hsl(270,100%,68%)]/10 blur-[120px] rounded-full -z-10" />
            <motion.div initial="hidden" animate="show" variants={container} className="w-full space-y-6 md:space-y-8">
              <motion.h1 variants={maskWordContainer} className="text-4xl sm:text-6xl md:text-8xl font-display font-normal tracking-tight leading-[1.08] text-white">
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
              <motion.p variants={reveal} className="text-lg md:text-2xl text-white/85 max-w-2xl mx-auto leading-relaxed">
                Turn the news you follow into a trusted publication for your community, clients, or team.
              </motion.p>
              <motion.div variants={reveal}>
                <FeedIdeaGenerator />
              </motion.div>

              <motion.div
                variants={reveal}
                className="flex flex-col items-center justify-center gap-4 pt-1 sm:flex-row sm:gap-x-10 md:pt-4"
              >
                <button
                  type="button"
                  onClick={() => setExplainerOpen(true)}
                  className="group flex items-center gap-3 text-white/70 transition-all hover:text-white"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all group-hover:border-[hsl(155,100%,67%)] group-hover:bg-[hsl(155,100%,67%)]/10">
                    <Play
                      className="ml-0.5 h-4 w-4 fill-current text-white transition-colors group-hover:text-[hsl(155,100%,67%)]"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-base font-medium">Watch the 60-second film</span>
                </button>
                <Link
                  to="/feed/eastbourne"
                  className="group flex items-center gap-3 text-white/70 transition-all hover:text-white"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all group-hover:border-[hsl(270,100%,68%)] group-hover:bg-[hsl(270,100%,68%)]/10">
                    <ArrowRight
                      className="h-4 w-4 text-white transition-colors group-hover:text-[hsl(270,100%,68%)]"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-base font-medium">See a live feed</span>
                </Link>
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
                <h3 className="text-2xl md:text-3xl font-display italic text-white">Always-on gathering</h3>
                <p className="text-lg text-white/85 leading-relaxed">
                  Point Curatr almost anywhere. It keeps watch, so nothing important slips past.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="space-y-4">
                <span className="block font-display text-5xl text-[hsl(270,100%,68%)] opacity-60">02</span>
                <h3 className="text-2xl md:text-3xl font-display italic text-white">Summaries in your voice</h3>
                <p className="text-lg text-white/85 leading-relaxed">
                  Dry articles rewritten in a consistent style and always linked to the original source.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="space-y-4">
                <span className="block font-display text-5xl text-white/25">03</span>
                <h3 className="text-2xl md:text-3xl font-display italic text-white">Delivered in any channel</h3>
                <p className="text-lg text-white/85 leading-relaxed">
                  Curated stories become your feed, your newsletter, and your social posts.
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
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 border border-white/10">
              {[
                { label: 'Channel 01', title: 'Email newsletters', body: 'Daily or weekly digests, sent automatically.' },
                { label: 'Channel 02', title: 'Social carousels', body: 'Ready-to-post slides for Instagram, LinkedIn, and X.' },
                { label: 'Channel 03', title: 'Mobile-first feed', body: 'Your own branded feed, built for swiping.' },
                { label: 'Channel 04', title: 'ChatGPT & Claude', body: 'Your feed as an AI connector, with sources credited and linked.' },
              ].map((c) => (
                <motion.div
                  key={c.title}
                  variants={reveal}
                  className="group bg-[hsl(214,50%,9%)] p-10 hover:bg-white/[0.03] transition-colors"
                >
                  <h4 className="text-[hsl(270,100%,68%)] font-semibold uppercase tracking-widest text-xs mb-6">{c.label}</h4>
                  <h3 className="text-3xl font-display mb-4 text-white group-hover:text-[hsl(155,100%,67%)] transition-colors">{c.title}</h3>
                  <p className="text-lg text-white/85 leading-relaxed">{c.body}</p>
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
                segments={[{ text: 'AI tools that build' }, { text: 'engagement & community', italic: true }]}
                className="text-4xl md:text-5xl font-display tracking-tight text-white leading-[1.1] flex flex-wrap justify-center"
              />
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { title: 'AI illustrations', loop: 'illustrations' as FeatureLoopName, body: 'Unique editorial artwork for every story. No stock photos.' },
                { title: 'Play Mode', loop: 'play' as FeatureLoopName, body: 'Readers swipe through stories and rate them.' },
                { title: 'Sentiment tracking', loop: 'sentiment' as FeatureLoopName, body: 'See what your community cares about, before it trends.' },
              ].map((f) => (
                <motion.div key={f.title} variants={reveal} className="border-l border-white/10 pl-8 pb-8">
                  <FeatureLoop name={f.loop} />
                  <h4 className="text-2xl md:text-3xl font-display italic mb-4 text-white">{f.title}</h4>
                  <p className="text-lg text-white/85 leading-relaxed">{f.body}</p>
                </motion.div>
              ))}
            </div>

            <motion.div variants={reveal} className="mt-12 text-center">
              <Link
                to="/features"
                className="group relative inline-flex items-center justify-center rounded-full px-8 py-4 transition-all duration-500 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(270,100%,68%)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(214,50%,9%)] sm:px-12 sm:py-5"
              >
                <span className="absolute inset-0 rounded-full border border-white/10 bg-white/5 backdrop-blur-md transition-all duration-500 group-hover:border-[hsl(155,100%,67%)]/50 group-hover:bg-white/10 group-hover:shadow-[0_0_30px_0_hsl(155_100%_67%_/_15%)]" />
                <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[hsl(270,100%,68%)] to-[hsl(155,100%,67%)] opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-20" />
                <span className="relative flex items-center gap-3 text-base font-medium tracking-tight text-white sm:text-lg">
                  Explore every feature
                  <ArrowRight className="h-5 w-5 text-[hsl(155,100%,67%)] transition-transform duration-500 group-hover:translate-x-1.5" />
                </span>
                <span className="absolute bottom-0 left-1/2 h-px w-0 -translate-x-1/2 bg-gradient-to-r from-transparent via-[hsl(270,100%,68%)] to-transparent transition-all duration-700 group-hover:w-3/4" />
              </Link>
            </motion.div>
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
                  segments={[{ text: "Always in the" }, { text: "editor's chair", italic: true }]}
                  className="text-5xl md:text-6xl font-display tracking-tight text-white leading-[1.1]"
                />
                <div className="space-y-8">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(155,100%,67%)] mb-2">01. Nothing publishes without you</h3>
                    <p className="text-lg text-white/85 leading-relaxed">
                      Every story waits in your approval queue.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(270,100%,68%)] mb-2">02. Credit where it's due</h3>
                    <p className="text-lg text-white/85 leading-relaxed">
                      Every story links back to the original publication.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-2">03. See what's working</h3>
                    <p className="text-lg text-white/85 leading-relaxed">
                      Everything in one dashboard.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={reveal} className="bg-white/5 rounded-2xl p-8 border border-white/10">
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-2">
                  <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Pipeline overview</span>
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
          <ExplainerOverlay
            open={explainerOpen}
            onClose={() => setExplainerOpen(false)}
            endCta={
              <Button
                asChild
                className="rounded-full bg-[hsl(155,100%,67%)] px-6 text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]"
              >
                <Link to={user ? '/dashboard' : '/auth'}>Start free</Link>
              </Button>
            }
          />

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
              <p className="text-xl md:text-2xl text-white/85 max-w-2xl mx-auto leading-relaxed">
                Whether you're serving a town, an industry, or a community of enthusiasts.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-12">
              <motion.div variants={reveal} className="p-10 bg-[hsl(214,50%,12%)] rounded-xl">
                <h3 className="text-2xl font-display text-white mb-3">Local news feeds</h3>
                <p className="text-lg text-white/85 leading-relaxed">
                  Everything happening in your town, from every local source.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="p-10 bg-[hsl(214,50%,12%)] rounded-xl border border-[hsl(270,100%,68%)]/20">
                <h3 className="text-2xl font-display text-white mb-3">Industry newsletters</h3>
                <p className="text-lg text-white/85 leading-relaxed">
                  Become the person your industry reads, and grow a subscriber base.
                </p>
              </motion.div>

              <motion.div variants={reveal} className="p-10 bg-[hsl(214,50%,12%)] rounded-xl">
                <h3 className="text-2xl font-display text-white mb-3">Niche communities</h3>
                <p className="text-lg text-white/85 leading-relaxed">
                  Sport, tech, culture, hobbies: whatever your people care about.
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
                Coming next: one-click social publishing, subscriptions, team workspaces, and an API. In development, not yet available.
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
                segments={[{ text: 'Start your feed' }, { text: 'for free', italic: true }]}
                className="text-4xl md:text-5xl font-display text-white mb-4 leading-[1.1]"
              />
              <p className="text-lg text-white/85 mb-8 max-w-lg mx-auto leading-relaxed">
                Connect your sources and publish today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <motion.div {...hoverLift}>
                  <Button asChild size="lg" className="rounded-full px-8 h-12 bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                    <Link to={user ? '/dashboard' : '/auth'}>Start free</Link>
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
