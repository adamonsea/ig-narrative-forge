import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';

import { 
  Plus, 
  Edit, 
  Trash2, 
  Globe, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  BarChart3,
  Settings,
  Download,
  Play
} from 'lucide-react';

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

interface SourceManagerProps {
  sources: ContentSource[];
  onSourcesChange: () => void;
}

export const SourceManager = ({ sources, onSourcesChange }: SourceManagerProps) => {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSource, setEditingSource] = useState<ContentSource | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [newSource, setNewSource] = useState({
    source_name: '',
    feed_url: '',
    region: 'Eastbourne',
    credibility_score: 70,
    scrape_frequency_hours: 24,
    content_type: 'news',
  });

  const handleAddSource = async () => {
    if (!newSource.source_name.trim() || !newSource.feed_url.trim()) {
      toast({
        title: 'Error',
        description: 'Source name and feed URL are required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const domain = extractDomainFromUrl(newSource.feed_url);
      
      const { error } = await supabase
        .from('content_sources')
        .insert({
          source_name: newSource.source_name.trim(),
          feed_url: newSource.feed_url.trim(),
          canonical_domain: domain,
          region: newSource.region,
          credibility_score: newSource.credibility_score,
          scrape_frequency_hours: newSource.scrape_frequency_hours,
          content_type: newSource.content_type,
          is_active: true,
          is_whitelisted: true,
          is_blacklisted: false,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Content source added successfully',
      });

      setNewSource({
        source_name: '',
        feed_url: '',
        region: 'Eastbourne',
        credibility_score: 70,
        scrape_frequency_hours: 24,
        content_type: 'news',
      });
      setShowAddForm(false);
      onSourcesChange();
    } catch (error) {
      console.error('Error adding source:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add content source',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSource = async (sourceId: string, updates: Partial<ContentSource>) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('content_sources')
        .update(updates)
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Source updated successfully',
      });

      onSourcesChange();
    } catch (error) {
      console.error('Error updating source:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update source',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this source? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('content_sources')
        .delete()
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Source deleted successfully',
      });

      onSourcesChange();
    } catch (error) {
      console.error('Error deleting source:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete source',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeSource = async (source: ContentSource) => {
    if (!source.feed_url) {
      toast({
        title: 'Error',
        description: 'No URL configured for this source',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      toast({
        title: 'Scraping Started',
        description: `Scraping content from ${source.source_name}...`,
      });

      const { data, error } = await supabase.functions.invoke('universal-scraper', {
        body: {
          feedUrl: source.feed_url,
          sourceId: source.id,
          region: source.region || 'Eastbourne'
        }
      });

      if (error) throw error;

      if (data?.success) {
        let description = `Found ${data.articlesFound} articles using ${data.method}`;
        
        if (data.articlesStored > 0) {
          description += `, stored ${data.articlesStored} new articles`;
        }
        
        if (data.duplicatesSkipped > 0) {
          description += `, skipped ${data.duplicatesSkipped} duplicates`;
        }
        
        if (data.filteredForRelevance > 0) {
          description += `, filtered ${data.filteredForRelevance} for low relevance`;
        }
        
        toast({
          title: 'Scraping Complete',
          description,
        });
        
        if (data.errors && data.errors.length > 0) {
          console.warn('Scraping warnings:', data.errors);
        }
      } else {
        throw new Error(data?.error || 'Scraping failed');
      }

      onSourcesChange();
    } catch (error) {
      console.error('Scraping error:', error);
      toast({
        title: 'Scraping Failed',
        description: error.message || 'Failed to scrape content from source',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeAll = async () => {
    const activeSources = sources.filter(s => s.is_active && s.feed_url);
    
    if (activeSources.length === 0) {
      toast({
        title: 'No Sources',
        description: 'No active sources found to scrape',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    let totalArticlesFound = 0;
    let totalArticlesScraped = 0;
    let failedSources = 0;

    try {
      toast({
        title: 'Bulk Scraping Started',
        description: `Scraping ${activeSources.length} sources...`,
      });

      for (const source of activeSources) {
        try {
          const { data, error } = await supabase.functions.invoke('universal-scraper', {
            body: {
              feedUrl: source.feed_url,
              sourceId: source.id,
              region: source.region || 'Eastbourne'
            }
          });

          if (error) throw error;

          if (data?.success) {
            totalArticlesFound += data.articlesFound || 0;
            totalArticlesScraped += data.articlesStored || 0;
          } else {
            failedSources++;
          }
        } catch (error) {
          console.error(`Failed to scrape ${source.source_name}:`, error);
          failedSources++;
        }

        // Small delay between sources to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      toast({
        title: 'Bulk Scraping Complete',
        description: `Found ${totalArticlesFound} articles, scraped ${totalArticlesScraped} relevant ones. ${failedSources} sources failed.`,
      });

      onSourcesChange();
    } catch (error) {
      console.error('Bulk scraping error:', error);
      toast({
        title: 'Bulk Scraping Failed',
        description: error.message || 'Failed to complete bulk scraping',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const extractDomainFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown-domain';
    }
  };

  const getStatusBadge = (source: ContentSource) => {
    if (source.is_blacklisted) {
      return <Badge variant="destructive">Blacklisted</Badge>;
    }
    if (!source.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    if ((source.success_rate || 0) < 50) {
      return <Badge variant="outline" className="text-orange-600">Issues</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  const getCredibilityColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Content Sources</h2>
            <p className="text-muted-foreground">
              Enhanced universal web scraping with AI-powered content extraction
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleScrapeAll}
              disabled={loading || sources.filter(s => s.is_active).length === 0}
              variant="outline"
            >
              <Download className="w-4 h-4 mr-2" />
              Scrape All Active
            </Button>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Source
            </Button>
          </div>
        </div>

        <Separator />

      {/* Add Source Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Content Source</CardTitle>
            <CardDescription>
              Add any website or RSS feed for universal content scraping
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="source-name">Source Name *</Label>
                <Input
                  id="source-name"
                  placeholder="e.g., BBC News"
                  value={newSource.source_name}
                  onChange={(e) => setNewSource(prev => ({ ...prev, source_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="feed-url">Website or RSS URL *</Label>
                <Input
                  id="feed-url"
                  placeholder="https://eastbourneherald.co.uk OR https://example.com/feed.xml"
                  value={newSource.feed_url}
                  onChange={(e) => setNewSource(prev => ({ ...prev, feed_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Works with any website - RSS feeds, news sites, or regular web pages
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="region">Region</Label>
                <Select 
                  value={newSource.region} 
                  onValueChange={(value) => setNewSource(prev => ({ ...prev, region: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Eastbourne">Eastbourne</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="national">National</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="credibility">Credibility Score (1-100)</Label>
                <Input
                  id="credibility"
                  type="number"
                  min="1"
                  max="100"
                  value={newSource.credibility_score}
                  onChange={(e) => setNewSource(prev => ({ ...prev, credibility_score: parseInt(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="frequency">Scrape Frequency (hours)</Label>
                <Input
                  id="frequency"
                  type="number"
                  min="1"
                  max="168"
                  value={newSource.scrape_frequency_hours}
                  onChange={(e) => setNewSource(prev => ({ ...prev, scrape_frequency_hours: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddSource} disabled={loading}>
                Add Source
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources List */}
      <div className="grid gap-4">
        {sources.map((source) => (
          <Card key={source.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">{source.source_name}</h3>
                    {getStatusBadge(source)}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Domain</p>
                      <p className="text-sm font-medium">{source.canonical_domain}</p>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Credibility</p>
                      <p className={`text-sm font-bold ${getCredibilityColor(source.credibility_score)}`}>
                        {source.credibility_score || 'N/A'}/100
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Articles Scraped</p>
                      <p className="text-sm font-medium">{source.articles_scraped || 0}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-sm font-medium">
                        {source.success_rate ? `${source.success_rate.toFixed(1)}%` : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Last scraped: {source.last_scraped_at 
                        ? new Date(source.last_scraped_at).toLocaleDateString()
                        : 'Never'
                      }
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" />
                      Avg response: {source.avg_response_time_ms || 0}ms
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleScrapeSource(source)}
                    disabled={loading || !source.is_active}
                    className="flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    Scrape Now
                  </Button>

                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${source.id}`} className="text-sm">Active</Label>
                    <Switch
                      id={`active-${source.id}`}
                      checked={source.is_active || false}
                      onCheckedChange={(checked) => 
                        handleUpdateSource(source.id, { is_active: checked })
                      }
                      disabled={loading}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSource(source)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSource(source.id)}
                    disabled={loading}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sources.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No content sources configured yet. Add your first RSS feed to get started.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};