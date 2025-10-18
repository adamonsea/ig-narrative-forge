import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import RoundupCarousel from "@/components/RoundupCarousel";

interface Topic {
  id: string;
  name: string;
  slug: string;
}

interface Roundup {
  id: string;
  topic_id: string;
  roundup_type: string;
  period_start: string;
  period_end: string;
  story_ids: string[];
  slide_data: any;
  stats: any;
  is_published: boolean;
  created_at: string;
}

const DailyRoundup = () => {
  const { slug, date } = useParams<{ slug: string; date: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [roundup, setRoundup] = useState<Roundup | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDailyRoundup = async () => {
      if (!slug || !date) {
        navigate('/');
        return;
      }

      try {
        // Load topic
        const { data: topicData, error: topicError } = await supabase
          .from('safe_public_topics')
          .select('id, name, slug')
          .eq('slug', slug.toLowerCase())
          .maybeSingle();

        if (topicError || !topicData) {
          console.error('Topic error:', topicError);
          setTopic(null);
          setLoading(false);
          return;
        }

        setTopic(topicData);

        // Parse date and get roundup for that specific day
        const targetDate = parseISO(date);
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();

        const { data: roundupData, error: roundupError } = await supabase
          .from('topic_roundups')
          .select('*')
          .eq('topic_id', topicData.id)
          .eq('roundup_type', 'daily')
          .eq('period_start', startOfDay)
          .eq('is_published', true)
          .maybeSingle();

        if (roundupError || !roundupData) {
          console.error('Roundup error:', roundupError);
          setRoundup(null);
          setLoading(false);
          return;
        }

        setRoundup(roundupData);
      } catch (error) {
        console.error('Error loading daily roundup:', error);
        toast({
          title: "Error loading roundup",
          description: "Failed to load the daily roundup. Please try again.",
          variant: "destructive",
        });
        setRoundup(null);
      } finally {
        setLoading(false);
      }
    };

    loadDailyRoundup();
  }, [slug, date, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-1 md:px-4 py-8">
          <div className="mb-6">
            <Skeleton className="w-32 h-10" />
          </div>
          <div className="mb-8">
            <Skeleton className="w-full h-12" />
          </div>
          <Skeleton className="w-full h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!roundup || !topic) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-1 md:px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Roundup Not Available</h1>
            <p className="text-muted-foreground">
              The daily roundup for {date ? format(parseISO(date), 'MMMM d, yyyy') : 'this date'} is not available yet.
            </p>
            <Button asChild>
              <Link to={`/feed/${slug || ''}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to {topic?.name || 'Feed'}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen feed-background">
      <div className="max-w-lg mx-auto">
        {/* Sticky Header with Back Button */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4">
          <Button variant="outline" asChild>
            <Link to={`/feed/${slug}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to {topic.name}
            </Link>
          </Button>
        </div>
        
        <RoundupCarousel 
          roundup={roundup}
          topicId={topic.id}
          topicName={topic.name}
          topicSlug={slug!}
          roundupType="daily"
        />
      </div>
    </div>
  );
};

export default DailyRoundup;
