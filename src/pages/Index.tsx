import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Search, Filter, Sparkles, Gamepad2, Brain, Users, Image, Mail, Share2, TrendingUp, Rss, BarChart3, Globe, Zap, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { CookieConsent } from '@/components/CookieConsent';

const Index = () => {
  const { user, loading } = useAuth();
  usePageFavicon();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
              Curatr<span className="text-xl opacity-70">.pro</span>
            </div>
            <div className="flex items-center gap-4">
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
          <section className="max-w-5xl mx-auto text-center py-24 space-y-8">
            <div className="space-y-6">
              <h1 className="text-6xl md:text-7xl font-display font-semibold tracking-tight leading-[0.95] text-white">
                Your niche news feed, powered by AI
              </h1>
              <p className="text-xl md:text-2xl text-white/70 font-light max-w-2xl mx-auto leading-relaxed">
                Aggregate content from any source, transform it into beautiful stories, and deliver via newsletters, social carousels, or your own branded feed.
              </p>
            </div>
            <div className="flex gap-4 justify-center pt-4">
              <Button asChild size="lg" className="rounded-full px-8 h-12 text-base bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                <Link to={user ? '/dashboard' : '/auth'}>Start curating free</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="rounded-full px-8 h-12 text-base border-2 border-[hsl(270,100%,68%)] bg-transparent text-white hover:bg-[hsl(270,100%,68%)] hover:text-white">
                <Link to="/feed/eastbourne">View live demo</Link>
              </Button>
            </div>
          </section>

          {/* Core Value Props */}
          <section className="max-w-7xl mx-auto py-24">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="space-y-4">
                <div className="rounded-2xl bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <Rss className="h-7 w-7 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">Aggregate anything</h3>
                <p className="text-white/60 leading-relaxed">
                  Connect RSS feeds, news sites, blogs, or any web source. AI monitors and pulls relevant content 24/7, so you never miss a story.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-[hsl(270,100%,68%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Sparkles className="h-7 w-7 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">AI-powered rewrites</h3>
                <p className="text-white/60 leading-relaxed">
                  Transform dry articles into engaging stories with your tone and style. Full attribution to original sources always preserved.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <Globe className="h-7 w-7 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">Multi-channel delivery</h3>
                <p className="text-white/60 leading-relaxed">
                  Publish to your branded web feed, send automated newsletters, or export carousels for Instagram, LinkedIn, and more.
                </p>
              </div>
            </div>
          </section>

          {/* Distribution Features */}
          <section className="max-w-7xl mx-auto py-24">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-display font-semibold tracking-tight text-white mb-4">
                Reach your audience everywhere
              </h2>
              <p className="text-xl text-white/60 max-w-2xl mx-auto">
                One curation workflow, multiple distribution channels. Grow your audience on the platforms they use.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="rounded-xl bg-[hsl(270,100%,68%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Mail className="h-6 w-6 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-lg font-semibold text-white">Email newsletters</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Automated daily or weekly digests sent directly to subscribers. Beautiful templates, zero manual work.
                </p>
              </div>

              <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="rounded-xl bg-[hsl(155,100%,67%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <Share2 className="h-6 w-6 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-lg font-semibold text-white">Social carousels</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Export stories as swipeable image carousels for Instagram, LinkedIn, or Twitter. Drive traffic back to your feed.
                </p>
              </div>

              <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="rounded-xl bg-[hsl(270,100%,68%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Zap className="h-6 w-6 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-lg font-semibold text-white">Mobile-first feed</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Your own branded news feed with swipe navigation, reader ratings, and instant story sharing.
                </p>
              </div>
            </div>
          </section>

          {/* AI & Engagement Features */}
          <section className="max-w-7xl mx-auto py-24">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-display font-semibold tracking-tight text-white mb-4">
                AI tools that drive engagement
              </h2>
              <p className="text-xl text-white/60 max-w-2xl mx-auto">
                Go beyond curation with intelligent features that transform passive readers into active communities.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="rounded-xl bg-[hsl(270,100%,68%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Image className="h-6 w-6 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-lg font-semibold text-white">AI illustrations</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Generate unique editorial artwork for every story. No stock photos, no copyright concerns.
                </p>
              </div>

              <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="rounded-xl bg-[hsl(155,100%,67%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <Gamepad2 className="h-6 w-6 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-lg font-semibold text-white">Play Mode</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Readers swipe through stories, rating content with hot-or-not mechanics that build habits.
                </p>
              </div>

              <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="rounded-xl bg-[hsl(270,100%,68%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Brain className="h-6 w-6 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-lg font-semibold text-white">Quiz cards</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Auto-generate knowledge quizzes from your content. Test and engage readers with gamification.
                </p>
              </div>

              <div className="bg-[hsl(214,50%,12%)] rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="rounded-xl bg-[hsl(155,100%,67%)]/10 w-12 h-12 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <TrendingUp className="h-6 w-6 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-lg font-semibold text-white">Sentiment tracking</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Monitor what topics resonate with your community. See trends emerge before they go mainstream.
                </p>
              </div>
            </div>
          </section>

          {/* Editorial Control Section */}
          <section className="max-w-7xl mx-auto py-24">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <h2 className="text-4xl md:text-5xl font-display font-semibold tracking-tight text-white">
                  You stay in control
                </h2>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="rounded-xl bg-[hsl(155,100%,67%)]/10 w-10 h-10 flex items-center justify-center border border-[hsl(155,100%,67%)]/30 shrink-0">
                      <Filter className="h-5 w-5 text-[hsl(155,100%,67%)]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">Editorial pipeline</h3>
                      <p className="text-white/60 text-sm leading-relaxed">
                        Every story passes through your approval queue. Accept, reject, or edit before publishing.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="rounded-xl bg-[hsl(270,100%,68%)]/10 w-10 h-10 flex items-center justify-center border border-[hsl(270,100%,68%)]/30 shrink-0">
                      <Shield className="h-5 w-5 text-[hsl(270,100%,68%)]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">Source attribution</h3>
                      <p className="text-white/60 text-sm leading-relaxed">
                        Every story links back to the original source. Build trust with readers and publishers alike.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="rounded-xl bg-[hsl(155,100%,67%)]/10 w-10 h-10 flex items-center justify-center border border-[hsl(155,100%,67%)]/30 shrink-0">
                      <BarChart3 className="h-5 w-5 text-[hsl(155,100%,67%)]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">Analytics dashboard</h3>
                      <p className="text-white/60 text-sm leading-relaxed">
                        Track feed visits, newsletter opens, top stories, and source performance in real-time.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[hsl(214,50%,12%)] rounded-3xl p-8 border border-white/10">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <span className="text-white/60 text-sm">Pipeline overview</span>
                    <span className="text-[hsl(155,100%,67%)] text-sm font-medium">Live demo</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-white">Pending review</span>
                      <span className="text-[hsl(270,100%,68%)] font-mono">12</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-white">Published today</span>
                      <span className="text-[hsl(155,100%,67%)] font-mono">8</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-white">Active sources</span>
                      <span className="text-white/70 font-mono">16</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-white">Newsletter subs</span>
                      <span className="text-white/70 font-mono">142</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Workflow Timeline */}
          <section className="max-w-5xl mx-auto py-24">
            <h2 className="text-4xl md:text-5xl font-display font-semibold text-center mb-16 tracking-tight text-white">
              How it works
            </h2>

            {/* Timeline */}
            <div className="relative">
              {/* Connecting line - desktop */}
              <div className="hidden lg:block absolute top-7 left-[calc(12.5%+28px)] right-[calc(12.5%+28px)] h-px bg-gradient-to-r from-[hsl(155,100%,67%)]/40 via-[hsl(270,100%,68%)]/40 to-[hsl(155,100%,67%)]/40" />

              {/* Timeline items */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
                {/* Step 1 - Connect */}
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative z-10 rounded-full bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/40 ring-4 ring-[hsl(214,50%,9%)]">
                    <Rss className="h-6 w-6 text-[hsl(155,100%,67%)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Connect sources</h3>
                  <p className="text-white/60 text-sm leading-relaxed max-w-[180px]">
                    Add RSS feeds, news sites, or any web source
                  </p>
                </div>

                {/* Step 2 - Curate */}
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative z-10 rounded-full bg-[hsl(270,100%,68%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(270,100%,68%)]/40 ring-4 ring-[hsl(214,50%,9%)]">
                    <Filter className="h-6 w-6 text-[hsl(270,100%,68%)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Curate content</h3>
                  <p className="text-white/60 text-sm leading-relaxed max-w-[180px]">
                    Approve stories and let AI transform them
                  </p>
                </div>

                {/* Step 3 - Publish */}
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative z-10 rounded-full bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/40 ring-4 ring-[hsl(214,50%,9%)]">
                    <Share2 className="h-6 w-6 text-[hsl(155,100%,67%)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Distribute</h3>
                  <p className="text-white/60 text-sm leading-relaxed max-w-[180px]">
                    Publish to feed, send newsletters, export carousels
                  </p>
                </div>

                {/* Step 4 - Grow */}
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative z-10 rounded-full bg-[hsl(270,100%,68%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(270,100%,68%)]/40 ring-4 ring-[hsl(214,50%,9%)]">
                    <Users className="h-6 w-6 text-[hsl(270,100%,68%)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Grow audience</h3>
                  <p className="text-white/60 text-sm leading-relaxed max-w-[180px]">
                    Build a loyal community around your niche
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Use Cases */}
          <section className="max-w-7xl mx-auto py-24">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-display font-semibold tracking-tight text-white mb-4">
                Built for curators
              </h2>
              <p className="text-xl text-white/60 max-w-2xl mx-auto">
                Whether you're building a local news service, industry newsletter, or community hub.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-gradient-to-b from-[hsl(155,100%,67%)]/5 to-transparent rounded-2xl p-8 border border-[hsl(155,100%,67%)]/20">
                <h3 className="text-xl font-semibold text-white mb-3">Local news feeds</h3>
                <p className="text-white/60 leading-relaxed">
                  Aggregate hyperlocal news from multiple sources. Perfect for town-focused digests, community newsletters, or regional news apps.
                </p>
              </div>

              <div className="bg-gradient-to-b from-[hsl(270,100%,68%)]/5 to-transparent rounded-2xl p-8 border border-[hsl(270,100%,68%)]/20">
                <h3 className="text-xl font-semibold text-white mb-3">Industry newsletters</h3>
                <p className="text-white/60 leading-relaxed">
                  Curate the best content from your industry. Build authority and grow a subscriber base with zero content creation overhead.
                </p>
              </div>

              <div className="bg-gradient-to-b from-[hsl(155,100%,67%)]/5 to-transparent rounded-2xl p-8 border border-[hsl(155,100%,67%)]/20">
                <h3 className="text-xl font-semibold text-white mb-3">Niche communities</h3>
                <p className="text-white/60 leading-relaxed">
                  Create engaging feeds for any interest—sports, tech, culture, or hobbies. Gamification keeps readers coming back.
                </p>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="max-w-3xl mx-auto py-24 text-center">
            <div className="bg-[hsl(214,50%,12%)] rounded-3xl p-12 border border-[hsl(270,100%,68%)]/20">
              <h2 className="text-3xl md:text-4xl font-display font-semibold text-white mb-4">
                Start building your feed today
              </h2>
              <p className="text-white/60 mb-8 max-w-lg mx-auto">
                Free to start. Connect your sources, curate content, and launch your first newsletter in minutes.
              </p>
              <div className="flex gap-4 justify-center">
                <Button asChild size="lg" className="rounded-full px-8 h-12 bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                  <Link to={user ? '/dashboard' : '/auth'}>Get started free</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="rounded-full px-8 h-12 text-white hover:bg-white/10">
                  <Link to="/pricing">View pricing</Link>
                </Button>
              </div>
            </div>
          </section>

        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 py-8 mt-12">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/50">
            <p>© {new Date().getFullYear()} curatr.pro. All rights reserved.</p>
            <p>
              Built by{' '}
              <a 
                href="https://getlit.pro" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors underline underline-offset-2"
              >
                getlit.pro
              </a>
            </p>
          </div>
        </footer>
      </div>
      <CookieConsent variant="home" />
    </div>
  );
};

export default Index;
