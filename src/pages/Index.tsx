import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, FileText, ExternalLink, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      // Redirect authenticated users to dashboard
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Show loading while auth is being determined
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show landing page for non-authenticated users
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
        <div className="container mx-auto px-6 py-24 relative">
          <div className="text-center space-y-8 max-w-3xl mx-auto">
            <div className="space-y-4">
              <h1 className="text-7xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                curatr
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Automated content curation that aggregates, filters, and simplifies 
                any topic into digestible feeds
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
              <Button size="lg" asChild className="text-base px-8">
                <Link to="/auth">
                  Start Curating
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-base px-8">
                <Link to="/feed/eastbourne">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Demo
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Settings className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Automated Discovery</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              AI finds and aggregates content from thousands of sources, 
              automatically filtering for quality and relevance
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Smart Simplification</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Complex topics broken down into clear, digestible summaries 
              with visual carousels for easy consumption
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <ExternalLink className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Effortless Sharing</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Publish curated feeds that build your audience while 
              maintaining full attribution to original sources
            </p>
          </div>
        </div>
      </div>

      {/* Value Proposition */}
      <div className="bg-muted/30">
        <div className="container mx-auto px-6 py-16">
          <div className="text-center max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold">From Information Overload to Clarity</h2>
            <p className="text-muted-foreground leading-relaxed">
              Stop drowning in feeds. Start with focused, automated curation 
              that turns any topic into an organized, shareable knowledge stream.
            </p>
            <Button size="lg" asChild className="mt-8">
              <Link to="/auth">
                Create Your Feed
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;