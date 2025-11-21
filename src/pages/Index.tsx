import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Search, Filter, Sparkles, BarChart } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
const Index = () => {
  const {
    user,
    loading
  } = useAuth();

  // Show loading while auth is being determined
  if (loading) {
    return <div className="min-h-screen bg-gradient-to-br from-background to-muted/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="min-h-screen bg-[hsl(214,50%,9%)]">
      {/* Organic dark gradient with subtle purple accents */}
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
            <div>
              {user ? <Button asChild size="lg" className="rounded-full bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                  <Link to="/dashboard">Dashboard</Link>
                </Button> : <Button asChild variant="ghost" size="lg" className="rounded-full text-white hover:bg-[hsl(270,100%,68%)]/20 border border-[hsl(270,100%,68%)]/30">
                  <Link to="/auth">Sign in</Link>
                </Button>}
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-6">
          {/* Hero Section */}
          <section className="max-w-5xl mx-auto text-center py-24 space-y-8">
            <div className="space-y-6">
              <h1 className="text-7xl md:text-8xl font-display font-semibold tracking-tight leading-[0.95] text-white">
                Editorial excellence,<br />simplified
              </h1>
              <p className="text-xl md:text-2xl text-white/70 font-light max-w-2xl mx-auto leading-relaxed">
                AI-powered editorial tools that make content curation, simplification and publishing effortless
              </p>
            </div>
            <div className="flex gap-4 justify-center pt-4">
              <Button asChild size="lg" className="rounded-full px-8 h-12 text-base bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]">
                <Link to={user ? "/dashboard" : "/auth"}>Get started</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="rounded-full px-8 h-12 text-base border-2 border-[hsl(270,100%,68%)] bg-transparent text-white hover:bg-[hsl(270,100%,68%)] hover:text-white">
                <Link to="/feed/eastbourne">View demo</Link>
              </Button>
            </div>
          </section>

          {/* Features Grid */}
          <section className="max-w-7xl mx-auto py-24">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="space-y-4">
                <div className="rounded-2xl bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <Search className="h-7 w-7 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">Smart discovery</h3>
                <p className="text-white/60 leading-relaxed">
                  Automatically discover and curate content from trusted sources with AI-driven insights
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-[hsl(270,100%,68%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Filter className="h-7 w-7 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">Advanced curation</h3>
                <p className="text-white/60 leading-relaxed">
                  Filter, approve, and manage content with tools designed for editorial excellence
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <Sparkles className="h-7 w-7 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">Beautiful publishing</h3>
                <p className="text-white/60 leading-relaxed">
                  Transform articles into engaging visual stories with automated generation and gorgeous feeds               
                </p>
              </div>
            </div>
          </section>

          {/* Workflow Section */}
          <section className="max-w-7xl mx-auto py-24">
            <h2 className="text-5xl font-display font-semibold text-center mb-20 tracking-tight text-white">
              Your editorial workflow
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-4">
                <div className="text-sm font-medium text-[hsl(155,100%,67%)]">Step 1</div>
                <div className="rounded-2xl bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <Search className="h-7 w-7 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-xl font-semibold text-white">Discover</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Connect sources and let AI discover relevant stories automatically
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm font-medium text-[hsl(270,100%,68%)]">Step 2</div>
                <div className="rounded-2xl bg-[hsl(270,100%,68%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Filter className="h-7 w-7 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-xl font-semibold text-white">Curate</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Review and approve content that meets your editorial standards
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm font-medium text-[hsl(155,100%,67%)]">Step 3</div>
                <div className="rounded-2xl bg-[hsl(155,100%,67%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(155,100%,67%)]/30">
                  <BarChart className="h-7 w-7 text-[hsl(155,100%,67%)]" />
                </div>
                <h3 className="text-xl font-semibold text-white">Analyze</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Track metrics and understand what resonates with your audience
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm font-medium text-[hsl(270,100%,68%)]">Step 4</div>
                <div className="rounded-2xl bg-[hsl(270,100%,68%)]/10 w-14 h-14 flex items-center justify-center border border-[hsl(270,100%,68%)]/30">
                  <Sparkles className="h-7 w-7 text-[hsl(270,100%,68%)]" />
                </div>
                <h3 className="text-xl font-semibold text-white">Publish</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  Transform approved content into beautiful, engaging stories
                </p>
              </div>
            </div>
          </section>

          {/* Footer spacing */}
          <div className="h-24" />
        </main>
      </div>
    </div>;
};
export default Index;