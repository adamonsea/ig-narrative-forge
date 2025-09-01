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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8 max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="space-y-4">
            <h1 className="text-6xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              curatr
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Create and share curated content feeds for any topic or community. 
              From local updates to specialized interests and industry insights.
            </p>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card className="text-left">
              <CardHeader>
                <Settings className="w-8 h-8 mb-2 text-primary" />
                <CardTitle>Custom Topics</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Create topics around any subject - from AI & Technology to local community content. 
                  Full control over sources and keywords.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left">
              <CardHeader>
                <FileText className="w-8 h-8 mb-2 text-primary" />
                <CardTitle>Smart Curation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  AI-powered content curation and story generation. 
                  Turn raw content into engaging, shareable social media carousels.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left">
              <CardHeader>
                <ExternalLink className="w-8 h-8 mb-2 text-primary" />
                <CardTitle>Public Feeds</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Share your curated feeds with the world. 
                  Build an audience around your expertise and interests.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Demo Feed */}
          <div className="mt-16 space-y-6">
            <h2 className="text-3xl font-bold">See it in Action</h2>
            <p className="text-muted-foreground">
              Check out our demo feed showcasing local content curation:
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link to="/feed/eastbourne">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Eastbourne Feed
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth">
                  Get Started Free
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 p-8 bg-primary/10 rounded-lg border">
            <h3 className="text-2xl font-bold mb-4">Ready to Start Curating?</h3>
            <p className="text-muted-foreground mb-6">
              Join creators, journalists, and community leaders who are already building 
              their audiences with personalized content curation.
            </p>
            <Button size="lg" asChild>
              <Link to="/auth">
                Create Your First Topic
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