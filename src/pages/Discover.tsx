import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Globe, MapPin, ArrowRight } from 'lucide-react';

const Discover = () => {
  const { data: topics, isLoading } = useQuery({
    queryKey: ['discover-topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safe_public_topics')
        .select('id, name, slug, description, topic_type, region')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Discover Feeds | Curatr</title>
        <meta name="description" content="Browse curated news feeds on local news, niche topics, and more. Find the feed that matters to you." />
        <link rel="canonical" href="https://curatr.pro/discover" />
        <meta property="og:title" content="Discover Feeds | Curatr" />
        <meta property="og:description" content="Browse curated news feeds on local news, niche topics, and more." />
        <meta property="og:url" content="https://curatr.pro/discover" />
      </Helmet>

      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-6 flex justify-between items-center">
          <Link to="/" className="text-2xl font-display font-semibold tracking-tight text-foreground">
            Curatr<span className="text-lg opacity-60">.pro</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Pricing
            </Link>
            <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="space-y-2 mb-10">
          <h1 className="text-4xl font-display font-semibold tracking-tight text-foreground">
            Discover Feeds
          </h1>
          <p className="text-lg text-muted-foreground">
            Curated news feeds on local communities, niche topics, and more — powered by AI.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : topics && topics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {topics.map((topic) => (
              <Link
                key={topic.id}
                to={`/feed/${topic.slug}`}
                className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-lg font-semibold text-card-foreground group-hover:text-primary transition-colors">
                    {topic.name}
                  </h2>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors mt-1 shrink-0" />
                </div>
                {topic.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {topic.description}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {topic.region && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {topic.region}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {topic.topic_type}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-12">No public feeds available yet.</p>
        )}
      </main>
    </div>
  );
};

export default Discover;
