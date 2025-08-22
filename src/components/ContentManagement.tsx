import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SourceManager } from './SourceManager';

interface ContentSource {
  id: string;
  source_name: string;
  feed_url: string | null;
  canonical_domain: string | null;
  credibility_score: number | null;
  is_active: boolean | null;
  articles_scraped: number | null;
  success_rate: number | null;
  avg_response_time_ms: number | null;
  last_scraped_at: string | null;
  region: string | null;
  content_type: string | null;
  is_whitelisted: boolean | null;
  is_blacklisted: boolean | null;
  scrape_frequency_hours: number | null;
}

export const ContentManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sources, setSources] = useState<ContentSource[]>([]);

  // Load initial data
  useEffect(() => {
    if (user) {
      loadSources();
    }
  }, [user]);

  const loadSources = async () => {
    try {
      const { data, error } = await supabase
        .from('content_sources')
        .select('*')
        .order('credibility_score', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error) {
      console.error('Error loading sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load content sources',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <p className="text-muted-foreground">Please log in to access content management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Get Stories</h1>
          <p className="text-muted-foreground">
            Manage and configure news sources for content discovery
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadSources}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Sources
          </Button>
        </div>
      </div>

      {/* Sources Management */}
      <SourceManager sources={sources} onSourcesChange={loadSources} />
    </div>
  );
};