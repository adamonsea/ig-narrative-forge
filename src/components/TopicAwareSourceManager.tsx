import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Settings, Trash2, ExternalLink, AlertCircle, Zap, Play, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
}

interface ContentSource {
  id: string;
  source_name: string;
  feed_url: string | null;
  canonical_domain: string | null;
  credibility_score: number | null;
  is_active: boolean | null;
  articles_scraped: number | null;
  last_scraped_at: string | null;
  topic_id: string | null;
  scraping_method: string | null;
  success_rate: number | null;
}

interface TopicAwareSourceManagerProps {
  selectedTopicId?: string;
  onSourcesChange: () => void;
}

export const TopicAwareSourceManager = ({ selectedTopicId, onSourcesChange }: TopicAwareSourceManagerProps) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [currentTopicId, setCurrentTopicId] = useState(selectedTopicId || '');
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [scrapingSource, setScrapingSource] = useState<string | null>(null);
  const [scrapingAll, setScrapingAll] = useState(false);
  const [automationSettings, setAutomationSettings] = useState<{
    scrape_frequency_hours: number;
    is_active: boolean;
  }>({ scrape_frequency_hours: 12, is_active: true });
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    loadTopics();
  }, []);

  useEffect(() => {
    if (currentTopicId) {
      loadSourcesForTopic(currentTopicId);
      loadAutomationSettings(currentTopicId);
    } else {
      setSources([]);
    }
  }, [currentTopicId]);

  const loadTopics = async () => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, topic_type, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTopics((data || []).map(topic => ({
        ...topic,
        topic_type: topic.topic_type as 'regional' | 'keyword'
      })));

      // Auto-select first topic if none selected
      if (data && data.length > 0 && !currentTopicId) {
        setCurrentTopicId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading topics:', error);
      toast({
        title: "Error",
        description: "Failed to load topics",
        variant: "destructive"
      });
    }
  };

  const loadSourcesForTopic = async (topicId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('content_sources')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error) {
      console.error('Error loading sources:', error);
      toast({
        title: "Error",
        description: "Failed to load sources for this topic",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAutomationSettings = async (topicId: string) => {
    try {
      const { data, error } = await supabase
        .from('topic_automation_settings')
        .select('*')
        .eq('topic_id', topicId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error;
      }

      if (data) {
        setAutomationSettings({
          scrape_frequency_hours: data.scrape_frequency_hours,
          is_active: data.is_active
        });
      }
    } catch (error) {
      console.error('Error loading automation settings:', error);
    }
  };

  const extractDomainFromUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return domain.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const handleAddSource = async () => {
    if (!newUrl.trim() || !currentTopicId) {
      toast({
        title: "Error",
        description: "Please select a topic and enter a valid URL",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const domain = extractDomainFromUrl(newUrl);

      const { error } = await supabase
        .from('content_sources')
        .insert({
          source_name: domain,
          feed_url: newUrl,
          canonical_domain: domain,
          topic_id: currentTopicId,
          credibility_score: 70,
          is_active: true,
          scraping_method: 'rss'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Source "${domain}" added successfully`
      });

      // Trigger scraping for the new source
      try {
        await supabase.functions.invoke('topic-aware-scraper', {
          body: {
            feedUrl: newUrl,
            topicId: currentTopicId
          }
        });
      } catch (scrapeError) {
        console.error('Scraping trigger failed:', scrapeError);
        // Don't show error to user as source was still added
      }

      setNewUrl('');
      setShowAddForm(false);
      loadSourcesForTopic(currentTopicId);
      onSourcesChange();
    } catch (error) {
      console.error('Error adding source:', error);
      toast({
        title: "Error",
        description: "Failed to add source",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSource = async (sourceId: string, sourceName: string) => {
    if (!confirm(`Are you sure you want to remove "${sourceName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('content_sources')
        .delete()
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Source "${sourceName}" removed`
      });

      loadSourcesForTopic(currentTopicId);
      onSourcesChange();
    } catch (error) {
      console.error('Error removing source:', error);
      toast({
        title: "Error",
        description: "Failed to remove source",
        variant: "destructive"
      });
    }
  };

  const toggleSourceStatus = async (sourceId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('content_sources')
        .update({ is_active: isActive })
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Source ${isActive ? 'activated' : 'deactivated'}`
      });

      loadSourcesForTopic(currentTopicId);
    } catch (error) {
      console.error('Error updating source status:', error);
      toast({
        title: "Error",
        description: "Failed to update source status",
        variant: "destructive"
      });
    }
  };

  const handleScrapeSource = async (source: ContentSource) => {
    if (!source.feed_url) return;
    
    try {
      setScrapingSource(source.id);
      
      const { data, error } = await supabase.functions.invoke('topic-aware-scraper', {
        body: {
          feedUrl: source.feed_url,
          topicId: currentTopicId,
          sourceId: source.id
        }
      });

      if (error) throw error;

      toast({
        title: "Scraping Started",
        description: `Started scraping "${source.source_name}"`
      });

      // Refresh sources to show updated last_scraped_at
      setTimeout(() => {
        loadSourcesForTopic(currentTopicId);
      }, 2000);

    } catch (error) {
      console.error('Error scraping source:', error);
      toast({
        title: "Scraping Failed",
        description: `Failed to scrape "${source.source_name}"`,
        variant: "destructive"
      });
    } finally {
      setScrapingSource(null);
    }
  };

  const handleScrapeAllSources = async () => {
    const activeSources = sources.filter(s => s.is_active && s.feed_url);
    if (activeSources.length === 0) {
      toast({
        title: "No Active Sources",
        description: "Add some active sources with URLs first",
        variant: "destructive"
      });
      return;
    }

    try {
      setScrapingAll(true);
      
      // Scrape all active sources in parallel
      const scrapePromises = activeSources.map(source => 
        supabase.functions.invoke('topic-aware-scraper', {
          body: {
            feedUrl: source.feed_url,
            topicId: currentTopicId,
            sourceId: source.id
          }
        })
      );

      await Promise.allSettled(scrapePromises);

      toast({
        title: "Bulk Scraping Started", 
        description: `Started scraping ${activeSources.length} sources`
      });

      // Refresh sources after scraping
      setTimeout(() => {
        loadSourcesForTopic(currentTopicId);
      }, 3000);

    } catch (error) {
      console.error('Error bulk scraping:', error);
      toast({
        title: "Bulk Scraping Failed",
        description: "Some sources may have failed to scrape",
        variant: "destructive"
      });
    } finally {
      setScrapingAll(false);
    }
  };

  const updateAutomationSettings = async (newSettings: { scrape_frequency_hours: number; is_active: boolean }) => {
    try {
      const { error } = await supabase
        .from('topic_automation_settings')
        .upsert({
          topic_id: currentTopicId,
          scrape_frequency_hours: newSettings.scrape_frequency_hours,
          is_active: newSettings.is_active,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setAutomationSettings(newSettings);
      
      toast({
        title: "Automation Updated",
        description: `Sources will be scraped every ${newSettings.scrape_frequency_hours} hours`
      });

    } catch (error) {
      console.error('Error updating automation settings:', error);
      toast({
        title: "Error",
        description: "Failed to update automation settings",
        variant: "destructive"
      });
    }
  };

  const currentTopic = topics.find(t => t.id === currentTopicId);

  return (
    <div className="space-y-6">
      {/* Topic Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Content Sources by Topic</CardTitle>
          <CardDescription>
            Manage website sources for your topics. Each topic can have its own set of sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic-select">Select Topic</Label>
            <Select value={currentTopicId} onValueChange={setCurrentTopicId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a topic to manage sources" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    <div className="flex items-center gap-2">
                      <Badge variant={topic.topic_type === 'regional' ? 'default' : 'secondary'}>
                        {topic.topic_type}
                      </Badge>
                      {topic.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {currentTopicId && !showAddForm && (
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Source to {currentTopic?.name}
            </Button>
          )}

          {showAddForm && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
              <div className="space-y-2">
                <Label htmlFor="source-url">Website URL or RSS Feed</Label>
                <Input
                  id="source-url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com/rss or https://example.com"
                  disabled={loading}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddSource} disabled={loading || !newUrl.trim()}>
                  {loading ? 'Adding...' : 'Add Source'}
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources List */}
      {currentTopicId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Sources for {currentTopic?.name}
                  <Badge variant="outline">
                    {sources.length} sources
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Website sources providing content for this topic
                </CardDescription>
              </div>
              
              {sources.filter(s => s.is_active && s.feed_url).length > 0 && (
                <Button 
                  onClick={handleScrapeAllSources}
                  disabled={scrapingAll}
                  variant="default"
                >
                  {scrapingAll ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  {scrapingAll ? 'Scraping All...' : 'Scrape All Active'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Automation Settings */}
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">Automation Settings</span>
                </div>
                <Badge variant={automationSettings.is_active ? "default" : "secondary"}>
                  {automationSettings.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="frequency-select" className="text-sm">Scrape every:</Label>
                  <Select 
                    value={automationSettings.scrape_frequency_hours.toString()} 
                    onValueChange={(value) => updateAutomationSettings({
                      ...automationSettings,
                      scrape_frequency_hours: parseInt(value)
                    })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                      <SelectItem value="24">Daily</SelectItem>
                      <SelectItem value="48">2 days</SelectItem>
                      <SelectItem value="168">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateAutomationSettings({
                    ...automationSettings,
                    is_active: !automationSettings.is_active
                  })}
                >
                  {automationSettings.is_active ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : sources.length > 0 ? (
              <div className="space-y-4">
                {sources.map((source) => (
                  <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{source.source_name}</h3>
                        <Badge variant={source.is_active ? "default" : "secondary"}>
                          {source.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {source.success_rate !== null && (
                          <Badge variant="outline">
                            {source.success_rate}% success
                          </Badge>
                        )}
                      </div>
                      
                      {source.feed_url && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {source.feed_url}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Articles: {source.articles_scraped || 0}</span>
                        <span>
                          Last scraped: {source.last_scraped_at 
                            ? new Date(source.last_scraped_at).toLocaleDateString()
                            : 'Never'
                          }
                        </span>
                        {source.scraping_method && (
                          <Badge variant="outline" className="text-xs">
                            {source.scraping_method}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {source.feed_url && source.is_active && (
                        <Button 
                          size="sm" 
                          variant="default"
                          onClick={() => handleScrapeSource(source)}
                          disabled={scrapingSource === source.id}
                        >
                          {scrapingSource === source.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1" />
                          ) : (
                            <Play className="w-3 h-3 mr-1" />
                          )}
                          {scrapingSource === source.id ? 'Scraping...' : 'Scrape Now'}
                        </Button>
                      )}
                      
                      {source.feed_url && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => window.open(source.feed_url!, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                      
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => toggleSourceStatus(source.id, !source.is_active)}
                      >
                        {source.is_active ? 'Disable' : 'Enable'}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemoveSource(source.id, source.source_name)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No sources added</h3>
                <p className="text-muted-foreground mb-4">
                  Add website sources to start collecting content for this topic
                </p>
                <Button onClick={() => setShowAddForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Source
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!currentTopicId && topics.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No topics available</h3>
            <p className="text-muted-foreground">
              Create a topic first to start adding content sources
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};