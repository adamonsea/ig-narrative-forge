import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Settings, Trash2, ExternalLink, AlertCircle, Zap, Play, Clock, RefreshCw, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getScraperFunction, createScraperRequestBody } from "@/lib/scraperUtils";
import { DiscardedArticlesViewer } from "./DiscardedArticlesViewer";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  region?: string;
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
  const [recovering, setRecovering] = useState(false);
  const [showDiscardedViewer, setShowDiscardedViewer] = useState(false);
  const [automationSettings, setAutomationSettings] = useState<{
    scrape_frequency_hours: number;
    is_active: boolean;
  }>({ scrape_frequency_hours: 12, is_active: true });
  const { toast } = useToast();
  const { user } = useAuth();

  // Pre-select topic if provided via props
  useEffect(() => {
    if (selectedTopicId && selectedTopicId !== currentTopicId) {
      setCurrentTopicId(selectedTopicId);
    }
  }, [selectedTopicId]);

  useEffect(() => {
    if (!selectedTopicId) {
      loadTopics();
    } else {
      // When selectedTopicId is provided, load the specific topic
      loadSpecificTopic(selectedTopicId);
    }
  }, [selectedTopicId]);

  const loadSpecificTopic = async (topicId: string) => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, topic_type, is_active, region')
        .eq('id', topicId)
        .single();

      if (error) throw error;
      
      if (data) {
        setTopics([{
          ...data,
          topic_type: data.topic_type as 'regional' | 'keyword'
        }]);
        setCurrentTopicId(data.id);
      }
    } catch (error) {
      console.error('Error loading specific topic:', error);
      toast({
        title: "Error",
        description: "Failed to load topic configuration",
        variant: "destructive"
      });
    }
  };

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
        .select('id, name, topic_type, is_active, region')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTopics((data || []).map(topic => ({
        ...topic,
        topic_type: topic.topic_type as 'regional' | 'keyword'
      })));

      // Auto-select first topic if none selected and no selectedTopicId prop
      if (data && data.length > 0 && !currentTopicId && !selectedTopicId) {
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
      const normalizedUrl = normalizeUrl(newUrl.trim());
      const domain = extractDomainFromUrl(normalizedUrl);

      const { error } = await supabase
        .from('content_sources')
        .insert({
          source_name: domain,
          feed_url: normalizedUrl,
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

      // Trigger scraping for the new source using appropriate scraper
      try {
        if (currentTopic) {
          const scraperFunction = getScraperFunction(currentTopic.topic_type);
          const requestBody = createScraperRequestBody(
            currentTopic.topic_type,
            normalizedUrl,
            { topicId: currentTopicId, sourceId: undefined, region: currentTopic.region }
          );
          
          await supabase.functions.invoke(scraperFunction, {
            body: requestBody
          });
        }
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
    if (!source.feed_url || !currentTopic) {
      toast({
        title: "Error",
        description: "Missing source URL or topic configuration",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setScrapingSource(source.id);
      
      const scraperFunction = getScraperFunction(currentTopic.topic_type);
      const requestBody = createScraperRequestBody(
        currentTopic.topic_type,
        source.feed_url,
        { topicId: currentTopicId, sourceId: source.id, region: currentTopic.region }
      );
      
      const { data, error } = await supabase.functions.invoke(scraperFunction, {
        body: requestBody
      });

      if (error) throw error;

      // Show detailed scraping results
      if (data && data.success) {
        const details = [
          `Found: ${data.articlesFound || 0}`,
          `Stored: ${data.articlesStored || 0}`,
          `Duplicates: ${data.duplicatesSkipped || 0}`,
          `Filtered: ${data.filteredForRelevance || 0}`
        ].join(' | ');

        toast({
          title: `Scraping Complete - ${source.source_name}`,
          description: `${details} | Method: ${data.method || 'unknown'}`,
          variant: data.articlesStored > 0 ? "default" : "destructive"
        });
      } else {
        toast({
          title: "Scraping Issues",
          description: data?.message || `Issues scraping "${source.source_name}"`,
          variant: "destructive"
        });
      }

      // Refresh sources to show updated last_scraped_at
      setTimeout(() => {
        loadSourcesForTopic(currentTopicId);
      }, 2000);

    } catch (error) {
      console.error('Error scraping source:', error);
      toast({
        title: "Scraping Failed",
        description: `Failed to scrape "${source.source_name}": ${error.message || 'Unknown error'}`,
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

    if (!currentTopic) {
      toast({
        title: "Error",
        description: "Topic configuration not loaded",
        variant: "destructive"
      });
      return;
    }

    try {
      setScrapingAll(true);
      
      // Scrape all active sources in parallel using appropriate scraper
      const scraperFunction = getScraperFunction(currentTopic.topic_type);
      const scrapePromises = activeSources.map(source => {
        const requestBody = createScraperRequestBody(
          currentTopic.topic_type,
          source.feed_url!,
          { topicId: currentTopicId, sourceId: source.id, region: currentTopic.region }
        );
        
        return supabase.functions.invoke(scraperFunction, {
          body: requestBody
        });
      });

      const results = await Promise.allSettled(scrapePromises);
      
      // Aggregate results from all sources
      let totalFound = 0;
      let totalStored = 0;
      let totalDuplicates = 0;
      let totalFiltered = 0;
      let successCount = 0;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value?.data?.success) {
          const data = result.value.data;
          totalFound += data.articlesFound || 0;
          totalStored += data.articlesStored || 0;
          totalDuplicates += data.duplicatesSkipped || 0;
          totalFiltered += data.filteredForRelevance || 0;
          successCount++;
        }
      });

      const summary = [
        `Found: ${totalFound}`,
        `Stored: ${totalStored}`,
        `Duplicates: ${totalDuplicates}`,
        `Filtered: ${totalFiltered}`
      ].join(' | ');

      toast({
        title: `Bulk Scraping Complete`,
        description: `${successCount}/${activeSources.length} sources scraped | ${summary}`,
        variant: totalStored > 0 ? "default" : "destructive"
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

  const handleRecoverOrphanedUrls = async () => {
    if (!currentTopicId) return;
    
    try {
      setRecovering(true);
      
      console.log('🔄 Starting URL recovery for topic:', currentTopicId);
      
      const { data, error } = await supabase.functions.invoke('recover-orphaned-urls', {
        body: { 
          topicId: currentTopicId,
          sourceId: null // Recover for all sources in this topic
        }
      });
      
      if (error) throw error;
      
      console.log('✅ URL recovery result:', data);
      
      toast({
        title: "Recovery Complete",
        description: `${data.recoveredCount} orphaned URLs recovered and available for retry`,
        variant: data.recoveredCount > 0 ? "default" : "destructive"
      });
      
      // Refresh sources to update stats
      if (currentTopicId) {
        await loadSourcesForTopic(currentTopicId);
      }
      
    } catch (error) {
      console.error('❌ Error recovering URLs:', error);
      toast({
        title: "Recovery Failed",
        description: "Failed to recover orphaned URLs. Please try again.",
        variant: "destructive"
      });
    } finally {
      setRecovering(false);
    }
  };

  const updateAutomationSettings = async (newSettings: { scrape_frequency_hours: number; is_active: boolean }) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to update automation settings",
        variant: "destructive"
      });
      return;
    }

    if (!currentTopicId) {
      toast({
        title: "Error",
        description: "No topic selected",
        variant: "destructive"
      });
      return;
    }

    try {
      // First, check if a record exists
      const { data: existing, error: checkError } = await supabase
        .from('topic_automation_settings')
        .select('id')
        .eq('topic_id', currentTopicId)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('topic_automation_settings')
          .update({
            scrape_frequency_hours: newSettings.scrape_frequency_hours,
            is_active: newSettings.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('topic_id', currentTopicId);

        if (updateError) throw updateError;
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('topic_automation_settings')
          .insert({
            topic_id: currentTopicId,
            scrape_frequency_hours: newSettings.scrape_frequency_hours,
            is_active: newSettings.is_active
          });

        if (insertError) throw insertError;
      }

      setAutomationSettings(newSettings);
      
      toast({
        title: "Automation Updated",
        description: `Sources will be scraped every ${newSettings.scrape_frequency_hours} hours`
      });

    } catch (error: any) {
      console.error('Error updating automation settings:', error);
      const errorMessage = error.message?.includes('row-level security') 
        ? "Permission denied. Please ensure you're logged in and have access to this topic."
        : `Failed to update automation settings: ${error.message}`;
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const currentTopic = topics.find(t => t.id === currentTopicId);

  return (
    <div className="space-y-6">
      {/* Topic Selection - Only show when not pre-selected */}
      {!selectedTopicId && (
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
          </CardContent>
        </Card>
      )}

      {/* Add Source Section */}
      {currentTopicId && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Source {selectedTopicId && currentTopic ? `to ${currentTopic.name}` : ''}</CardTitle>
            <CardDescription>
              Add website URLs or RSS feeds to scrape content from.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showAddForm && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Source{currentTopic ? ` to ${currentTopic.name}` : ''}
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
      )}

      {currentTopicId && sources.length > 0 && (
        <>
          {/* Source Management Cards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Sources for {currentTopic?.name}
                <div className="flex gap-2">
                  <Button
                    onClick={handleScrapeAllSources}
                    disabled={scrapingAll}
                    size="sm"
                    variant="outline"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    {scrapingAll ? 'Scraping All...' : 'Scrape All'}
                  </Button>
                  <Button 
                    onClick={handleRecoverOrphanedUrls}
                    disabled={recovering}
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {recovering ? 'Recovering...' : 'Recover URLs'}
                  </Button>
                  <Button 
                    onClick={() => setShowDiscardedViewer(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Discarded
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                Manage and monitor your content sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sources.map((source) => (
                  <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{source.source_name}</h4>
                        <Badge variant={source.is_active ? 'default' : 'secondary'}>
                          {source.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {source.credibility_score && (
                          <Badge variant="outline">
                            {source.credibility_score}% credible
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>Articles: {source.articles_scraped || 0}</p>
                        <p>Last scraped: {source.last_scraped_at ? new Date(source.last_scraped_at).toLocaleDateString() : 'Never'}</p>
                        {source.feed_url && (
                          <a 
                            href={source.feed_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {source.feed_url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => toggleSourceStatus(source.id, !source.is_active)}
                        size="sm"
                        variant="outline"
                      >
                        {source.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      {source.feed_url && (
                        <Button
                          onClick={() => handleScrapeSource(source)}
                          disabled={scrapingSource === source.id}
                          size="sm"
                          variant="outline"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          {scrapingSource === source.id ? 'Scraping...' : 'Scrape'}
                        </Button>
                      )}
                      <Button
                        onClick={() => handleRemoveSource(source.id, source.source_name)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Automation Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Automation Settings
              </CardTitle>
              <CardDescription>
                Configure automatic scraping for this topic
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="frequency">Scrape Frequency (hours):</Label>
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
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="48">48 hours</SelectItem>
                    <SelectItem value="72">72 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => updateAutomationSettings({
                    ...automationSettings,
                    is_active: !automationSettings.is_active
                  })}
                  variant={automationSettings.is_active ? 'default' : 'outline'}
                  size="sm"
                >
                  {automationSettings.is_active ? 'Automation On' : 'Automation Off'}
                </Button>
                {automationSettings.is_active && (
                  <p className="text-sm text-muted-foreground">
                    Sources will be scraped automatically every {automationSettings.scrape_frequency_hours} hours
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Discarded Articles Viewer */}
      {showDiscardedViewer && (
        <DiscardedArticlesViewer
          isOpen={showDiscardedViewer}
          topicId={currentTopicId}
          onClose={() => setShowDiscardedViewer(false)}
        />
      )}
    </div>
  );
};
