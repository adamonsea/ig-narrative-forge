import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Globe, AlertCircle, CheckCircle } from 'lucide-react';
import { ScrapingProgressIndicator } from './ScrapingProgressIndicator';

interface ContentSource {
  id: string;
  source_name: string;
  canonical_domain: string | null;
  is_active: boolean | null;
  articles_scraped: number | null;
  last_scraped_at: string | null;
}

interface TopicSourceManagerProps {
  topicId: string;
  topicName: string;
  region: string;
  onSourcesChange: () => void;
}

export const TopicSourceManager = ({ topicId, topicName, region, onSourcesChange }: TopicSourceManagerProps) => {
  const { toast } = useToast();
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    loadSources();
  }, [topicId]);

  const loadSources = async () => {
    try {
      const { data, error } = await supabase
        .from('content_sources')
        .select('id, source_name, canonical_domain, is_active, articles_scraped, last_scraped_at')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error) {
      console.error('Failed to load sources:', error);
    }
  };

  const extractDomainFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown-domain';
    }
  };

  const normalizeUrl = (url: string): string => {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL: URL must be a non-empty string');
    }

    let normalizedUrl = url.trim();
    
    // If URL already has protocol, validate and return
    if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
      try {
        new URL(normalizedUrl);
        return normalizedUrl;
      } catch (error) {
        throw new Error(`Invalid URL format: ${normalizedUrl}`);
      }
    }

    // Add https:// as default protocol
    normalizedUrl = 'https://' + normalizedUrl;
    
    try {
      new URL(normalizedUrl);
      return normalizedUrl;
    } catch (error) {
      // Try http as fallback
      const httpUrl = 'http://' + url.trim();
      try {
        new URL(httpUrl);
        return httpUrl;
      } catch (httpError) {
        throw new Error(`Invalid URL format: cannot normalize "${url}"`);
      }
    }
  };

  const handleAddSource = async () => {
    if (!newUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a valid website URL',
        variant: 'destructive',
      });
      return;
    }

    try {
      const processedUrl = normalizeUrl(newUrl.trim());
      setLoading(true);
      const domain = extractDomainFromUrl(processedUrl);

      // ONBOARDING PROTECTION: Validate source before adding
      try {
        const { data: validationResult, error: validationError } = await supabase.functions.invoke('validate-content-source', {
          body: {
            url: processedUrl,
            sourceType: 'website',
            topicType: 'regional',
            region: region,
            topicId: topicId
          }
        });

        if (validationError || (validationResult && !validationResult.success)) {
          toast({
            title: 'Source Validation Failed',
            description: validationResult?.error || validationError?.message || 'This source may not work properly',
            variant: 'destructive',
          });
          return;
        }

        if (validationResult?.warnings?.length > 0) {
          toast({
            title: 'Validation Warnings',
            description: `Added with ${validationResult.warnings.length} warnings - monitor performance`,
          });
        }
      } catch (validationErr) {
        console.warn('Source validation failed, adding anyway:', validationErr);
        toast({
          title: 'Added Without Validation',
          description: 'Source added but validation service unavailable',
        });
      }
      
      const { error } = await supabase
        .from('content_sources')
        .insert({
          source_name: domain,
          feed_url: processedUrl,
          canonical_domain: domain,
          topic_id: topicId,
          region: region,
          credibility_score: 70,
          scrape_frequency_hours: 24,
          content_type: 'news',
          is_active: true,
          is_whitelisted: true,
          is_blacklisted: false,
        });

      if (error) throw error;

      // Start background scraping using intelligent scraper for auto-method selection
      supabase.functions.invoke('intelligent-scraper', {
        body: {
          feedUrl: processedUrl,
          sourceId: null,
          topicId: topicId,
          region: region
        },
      }).catch(err => {
        console.error('Background scraping failed:', err);
      });

      toast({
        title: 'Website Added',
        description: 'Website validated and added successfully. Articles will be scraped automatically.',
      });

      setNewUrl('');
      setShowProgress(true); // Show real-time progress
      await loadSources();
      onSourcesChange();
    } catch (error) {
      console.error('Error adding source:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add website',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSource = async (sourceId: string) => {
    if (!confirm('Remove this website source?')) return;

    try {
      setLoading(true);
      
      // EMERGENCY FIX: Use topic_sources junction table for removal
      const { error: junctionError } = await supabase
        .from('topic_sources')
        .update({ is_active: false })
        .eq('topic_id', topicId)
        .eq('source_id', sourceId);

      if (junctionError) {
        console.warn('Junction table update failed:', junctionError);
        // Fallback to direct deletion
        const { error: deleteError } = await supabase
          .from('content_sources')
          .delete()
          .eq('id', sourceId);

        if (deleteError) throw deleteError;
      }

      toast({
        title: 'Success',
        description: 'Website source removed',
      });

      await loadSources();
      onSourcesChange();
    } catch (error) {
      console.error('Error removing source:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove source',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Progress Indicator */}
      <ScrapingProgressIndicator 
        topicId={topicId}
        isVisible={showProgress}
        onComplete={() => setShowProgress(false)}
      />
      
      {/* Add Website URL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Website Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder={`Enter website URL (e.g., localnews.com)`}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSource()}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleAddSource} disabled={loading || !newUrl.trim()}>
              {loading ? 'Adding...' : 'Add'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Add news websites to scrape articles from. All content will be tagged for {topicName} topic.
          </p>
        </CardContent>
      </Card>

      {/* Active Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Active Sources ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{source.canonical_domain}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant={source.is_active ? "default" : "secondary"} className="text-xs">
                        {source.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <span>{source.articles_scraped || 0} articles</span>
                      {source.last_scraped_at && (
                        <span>• Last: {new Date(source.last_scraped_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveSource(source.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
            
            {sources.length === 0 && (
              <div className="text-center py-8">
                <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No website sources added yet. Add your first {topicName} news source above.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};