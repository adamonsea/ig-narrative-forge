import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MapPin, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface Topic {
  id: string;
  name: string;
  description: string | null;
  topic_type: string;
  branding_config?: {
    logo_url?: string;
    icon_url?: string;
    subheader?: string;
    about_page_enabled?: boolean;
    about_page_content?: string;
    about_page_photo_url?: string;
  };
}

const AboutFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTopic = async () => {
      if (!slug) return;

      const { data, error } = await supabase
        .from('topics')
        .select('id, name, description, topic_type, branding_config')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching topic:', error);
        setLoading(false);
        return;
      }

      setTopic(data as Topic);
      setLoading(false);
    };

    fetchTopic();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Skeleton className="h-8 w-32 mb-8" />
          <Skeleton className="h-16 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!topic || !topic.branding_config?.about_page_enabled) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
          <h1 className="text-2xl font-bold mb-4">Page Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This about page doesn't exist or isn't enabled.
          </p>
          <Link to={`/feed/${slug}`}>
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Feed
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const branding = topic.branding_config;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Back link */}
        <Link 
          to={`/feed/${slug}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to feed
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={`${topic.name} logo`}
              className="h-16 mx-auto mb-4 object-contain"
            />
          ) : (
            <div className="flex items-center justify-center gap-2 mb-4">
              {topic.topic_type === 'regional' ? (
                <MapPin className="w-6 h-6 text-blue-500" />
              ) : (
                <Hash className="w-6 h-6 text-green-500" />
              )}
              <h1 className="text-2xl font-bold">{topic.name}</h1>
            </div>
          )}
          
          <h2 className="text-xl font-semibold text-foreground mb-2">
            About this feed
          </h2>
          
          {branding.subheader && (
            <p className="text-muted-foreground">
              {branding.subheader}
            </p>
          )}
        </div>

        {/* About photo */}
        {branding.about_page_photo_url && (
          <div className="mb-8">
            <img
              src={branding.about_page_photo_url}
              alt="About"
              className="w-full rounded-lg object-cover max-h-64"
            />
          </div>
        )}

        {/* About content */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {branding.about_page_content ? (
            <div className="whitespace-pre-wrap text-foreground leading-relaxed">
              {branding.about_page_content}
            </div>
          ) : topic.description ? (
            <p className="text-foreground">{topic.description}</p>
          ) : (
            <p className="text-muted-foreground italic">
              No additional information available about this feed.
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link to={`/feed/${slug}`}>
            <Button size="lg">
              Start Reading
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AboutFeed;
