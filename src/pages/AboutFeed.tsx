import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft } from 'lucide-react';
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
      <div className="min-h-screen bg-zinc-900">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Skeleton className="h-8 w-32 mb-8 bg-zinc-800" />
          <Skeleton className="h-16 w-full mb-4 bg-zinc-800" />
          <Skeleton className="h-64 w-full bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!topic || !topic.branding_config?.about_page_enabled) {
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100">
        <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
          <h1 className="text-2xl font-bold mb-4">Page Not Found</h1>
          <p className="text-zinc-400 mb-6">
            This about page doesn't exist or isn't enabled.
          </p>
          <Link 
            to={`/feed/${slug}`}
            className="inline-flex items-center gap-2 text-zinc-100 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  const branding = topic.branding_config;

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Back link */}
        <Link 
          to={`/feed/${slug}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 mb-8 transition-colors border border-zinc-700 rounded-full px-4 py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {topic.name}
        </Link>

        {/* Large About title */}
        <h1 className="text-4xl md:text-5xl font-bold text-zinc-100 mb-8">
          About
        </h1>

        {/* About photo */}
        {branding.about_page_photo_url && (
          <div className="mb-8">
            <img
              src={branding.about_page_photo_url}
              alt="About"
              className="w-full max-w-xs rounded-lg object-cover"
            />
          </div>
        )}

        {/* About content */}
        <div className="space-y-6">
          {branding.about_page_content ? (
            <div className="text-zinc-300 leading-relaxed text-base md:text-lg whitespace-pre-wrap">
              {branding.about_page_content}
            </div>
          ) : topic.description ? (
            <p className="text-zinc-300 leading-relaxed">{topic.description}</p>
          ) : (
            <p className="text-zinc-500 italic">
              No additional information available about this feed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AboutFeed;
