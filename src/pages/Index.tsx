import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, Eye, Share2, Heart, ArrowRight, User, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const { user, loading } = useAuth();

  // Show loading while auth is being determined
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="absolute top-0 right-0 p-6 z-10">
        {user ? (
          <Button size="sm" variant="ghost" asChild>
            <Link to="/dashboard">
              <User className="w-4 h-4" />
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" asChild>
            <Link to="/auth">
              <LogIn className="w-4 h-4" />
            </Link>
          </Button>
        )}
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-6 py-32 relative">
        <div className="text-center space-y-12 max-w-2xl mx-auto">
          <div className="space-y-6">
            <h1 className="text-8xl font-light tracking-tight text-foreground">
              Curatr
            </h1>
            <div className="text-sm text-muted-foreground font-medium tracking-wider uppercase">
              Beta
            </div>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              AI-powered editorial platform that discovers, curates, and publishes beautiful story feeds from any topic
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <Button size="lg" asChild>
                <Link to="/dashboard">
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            ) : (
              <Button size="lg" asChild>
                <Link to="/auth">
                  Start Now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            )}
            <Button size="lg" variant="ghost" asChild>
              <Link to="/feed/eastbourne">
                View Live Feed
              </Link>
            </Button>
          </div>
        </div>
      </div>
      {/* Features */}
      <div className="container mx-auto px-6 pb-32">
        <div className="grid md:grid-cols-4 gap-12 max-w-5xl mx-auto">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Zap className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Smart Discovery</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              AI continuously monitors and extracts stories from trusted sources. Automated keyword matching and quality scoring ensure only relevant content reaches your pipeline.
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Eye className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Editorial Polish</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Stories are rewritten for clarity and accessibility. AI generates custom illustrations in editorial style. One-click approval workflow keeps you in control.
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Heart className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Sentiment Analysis</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Automatic emotional tone detection with visual sentiment cards. Track community pulse and surface trending topics from local conversations.
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto">
              <Share2 className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="font-medium">Beautiful Publishing</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Stories published as swipeable carousel slides optimized for mobile. Full attribution to source publications. PWA-ready with push notifications.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;