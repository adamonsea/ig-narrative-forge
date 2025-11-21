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
  return <div className="min-h-screen bg-background">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-b from-background via-background to-muted/10 pointer-events-none" />
      
      <div className="relative z-10">
        <header className="container mx-auto px-6 py-8">
          <nav className="flex justify-between items-center max-w-7xl mx-auto">
            <div className="text-3xl font-display font-semibold tracking-tight">Curatr</div>
            <div>
              {user ? <Button asChild size="lg" className="rounded-full">
                  <Link to="/dashboard">Dashboard</Link>
                </Button> : <Button asChild variant="ghost" size="lg" className="rounded-full">
                  <Link to="/auth">Sign in</Link>
                </Button>}
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-6">
          {/* Hero Section */}
          <section className="max-w-5xl mx-auto text-center py-24 space-y-8">
            <div className="space-y-6">
              <h1 className="text-7xl md:text-8xl font-display font-semibold tracking-tight leading-[0.95]">
                Editorial excellence,<br />simplified
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground font-light max-w-2xl mx-auto leading-relaxed">
                AI-powered editorial tools that make content curation and simplification effortless
              </p>
            </div>
            <div className="flex gap-4 justify-center pt-4">
              <Button asChild size="lg" className="rounded-full px-8 h-12 text-base">
                <Link to={user ? "/dashboard" : "/auth"}>Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-8 h-12 text-base">
                <Link to="/feed/eastbourne">View demo</Link>
              </Button>
            </div>
          </section>

          {/* Features Grid */}
          <section className="max-w-7xl mx-auto py-24">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="space-y-4">
                <div className="rounded-2xl bg-muted/50 w-14 h-14 flex items-center justify-center">
                  <Search className="h-7 w-7 text-foreground" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">Smart discovery</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Automatically discover and curate content from trusted sources with AI-driven insights
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-muted/50 w-14 h-14 flex items-center justify-center">
                  <Filter className="h-7 w-7 text-foreground" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">Advanced curation</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Filter, approve, and manage content with tools designed for editorial excellence
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-muted/50 w-14 h-14 flex items-center justify-center">
                  <Sparkles className="h-7 w-7 text-foreground" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">Beautiful publishing</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Transform articles into engaging visual stories with automated generation and gorgeous feeds               
                </p>
              </div>
            </div>
          </section>

          {/* Workflow Section */}
          <section className="max-w-7xl mx-auto py-24">
            <h2 className="text-5xl font-display font-semibold text-center mb-20 tracking-tight">
              Your editorial workflow
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground">Step 1</div>
                <div className="rounded-2xl bg-primary/5 w-14 h-14 flex items-center justify-center">
                  <Search className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Discover</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Connect sources and let AI discover relevant stories automatically
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground">Step 2</div>
                <div className="rounded-2xl bg-primary/5 w-14 h-14 flex items-center justify-center">
                  <Filter className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Curate</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Review and approve content that meets your editorial standards
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground">Step 3</div>
                <div className="rounded-2xl bg-primary/5 w-14 h-14 flex items-center justify-center">
                  <BarChart className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Analyze</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Track metrics and understand what resonates with your audience
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground">Step 4</div>
                <div className="rounded-2xl bg-primary/5 w-14 h-14 flex items-center justify-center">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Publish</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
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