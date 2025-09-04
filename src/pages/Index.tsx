import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, Eye, Share2, Heart, ArrowRight } from 'lucide-react';
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
      <div className="container mx-auto px-6 py-32 relative">
        <div className="text-center space-y-12 max-w-2xl mx-auto">
          <div className="space-y-6">
            <h1 className="text-8xl font-light tracking-tight text-foreground">
              curatr
            </h1>
            <p className="text-lg text-muted-foreground">
              Turn any topic into a curated feed
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild>
              <Link to="/auth">
                Start Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link to="/feed/ai-agency">
                View Demo
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="container mx-auto px-6 pb-32">
        <div className="grid md:grid-cols-4 gap-12 max-w-4xl mx-auto">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Zap className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Auto-discover</h3>
            <p className="text-sm text-muted-foreground">
              AI finds relevant content
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Eye className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Simplify</h3>
            <p className="text-sm text-muted-foreground">
              Complex topics made clear
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Heart className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Sentiment</h3>
            <p className="text-sm text-muted-foreground">
              Auto-detect emotional tone
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Share2 className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Share</h3>
            <p className="text-sm text-muted-foreground">
              Publish beautiful feeds
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;