import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Settings, Trash2, ExternalLink, AlertCircle, Zap, Play, Clock, RefreshCw, Eye, CheckCircle, XCircle, TrendingUp, TrendingDown, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getScraperFunction, createScraperRequestBody } from "@/lib/scraperUtils";
import { DiscardedArticlesViewer } from "./DiscardedArticlesViewer";
import { UnifiedSourceManager } from "./UnifiedSourceManager";

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
  success_count?: number;
  failure_count?: number;
  last_error?: string | null;
  scrape_frequency_hours?: number;
}

interface SourceAutomationRule {
  id: string;
  source_url: string;
  success_count: number;
  failure_count: number;
  last_error: string | null;
  scrape_frequency_hours: number;
  is_active: boolean;
  last_scraped_at: string | null;
}

interface TopicAwareSourceManagerProps {
  selectedTopicId?: string;
  onSourcesChange: () => void;
}

export const TopicAwareSourceManager = ({ selectedTopicId, onSourcesChange }: TopicAwareSourceManagerProps) => {
  const [showDiscardedViewer, setShowDiscardedViewer] = useState(false);
  const [automationSettings, setAutomationSettings] = useState<{
    scrape_frequency_hours: number;
    is_active: boolean;
  }>({ scrape_frequency_hours: 12, is_active: true });
  const [sourceRules, setSourceRules] = useState<SourceAutomationRule[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  // Always use UnifiedSourceManager - this component is now a wrapper
  if (selectedTopicId) {
    return (
      <div className="space-y-6">
        <UnifiedSourceManager
          mode="topic"
          topicId={selectedTopicId}
          onSourcesChange={onSourcesChange}
        />
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDiscardedViewer(true)}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Discarded Articles
          </Button>
        </div>

        {showDiscardedViewer && (
          <DiscardedArticlesViewer
            isOpen={showDiscardedViewer}
            topicId={selectedTopicId}
            onClose={() => setShowDiscardedViewer(false)}
          />
        )}
      </div>
    );
  }

  // Legacy fallback - redirect to UnifiedSourceManager
  return (
    <div className="space-y-6">
      <UnifiedSourceManager
        mode="global"
        onSourcesChange={onSourcesChange}
        title="Legacy Source Manager"
        description="Please use the topic-specific source management instead"
      />
    </div>
  );

  // Legacy fallback for when no selectedTopicId is provided
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [currentTopicId, setCurrentTopicId] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [scrapingSource, setScrapingSource] = useState<string | null>(null);
  const [scrapingAll, setScrapingAll] = useState(false);
  const [recovering, setRecovering] = useState(false);

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
      loadSourceAutomationRules(currentTopicId);
    } else {
      setSources([]);
      setSourceRules([]);
    }
  }, [currentTopicId]);

  // Listen for source additions from suggestion tool
  useEffect(() => {
    const handleSourceAdded = () => {
      if (currentTopicId) {
        loadSourcesForTopic(currentTopicId);
      }
    };
    
    window.addEventListener('sourceAdded', handleSourceAdded);
    return () => window.removeEventListener('sourceAdded', handleSourceAdded);
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

  const loadSourceAutomationRules = async (topicId: string) => {
    try {
      const { data, error } = await supabase
        .from('scraping_automation')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSourceRules(data || []);
    } catch (error) {
      console.error('Error loading source automation rules:', error);
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
          const scraperFunction = getScraperFunction(currentTopic.topic_type, normalizedUrl);
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
        console.error('Gathering trigger failed:', scrapeError);
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
      
      const scraperFunction = getScraperFunction(currentTopic.topic_type, source.feed_url);
      const requestBody = createScraperRequestBody(
        currentTopic.topic_type,
        source.feed_url,
        { topicId: currentTopicId, sourceId: source.id, region: currentTopic.region }
      );
      
      const { data, error } = await supabase.functions.invoke(scraperFunction, {
        body: requestBody
      });

      if (error) throw error;

      // Show detailed gathering results and update automation rules
      if (data && data.success) {
        const details = [
          `Found: ${data.articlesFound || 0}`,
          `Stored: ${data.articlesStored || 0}`,
          `Duplicates: ${data.duplicatesSkipped || 0}`,
          `Filtered: ${data.filteredForRelevance || 0}`
        ].join(' | ');

        // Update success count
        if (source.feed_url) {
          await updateSourceAutomationRule(source.feed_url, {
            success_count: (sourceRules.find(r => r.source_url === source.feed_url)?.success_count || 0) + 1,
            last_scraped_at: new Date().toISOString(),
            last_error: null
          });
        }

        toast({
          title: `Content Gathering Complete - ${source.source_name}`,
          description: `${details} | Method: ${data.method || 'unknown'}`,
          variant: data.articlesStored > 0 ? "default" : "destructive"
        });
      } else {
        // Update failure count
        if (source.feed_url) {
          await updateSourceAutomationRule(source.feed_url, {
            failure_count: (sourceRules.find(r => r.source_url === source.feed_url)?.failure_count || 0) + 1,
            last_error: data?.message || 'Content gathering failed'
          });
        }

        toast({
          title: "Content Gathering Issues",
          description: data?.message || `Issues gathering content from "${source.source_name}"`,
          variant: "destructive"
        });
      }

      // Refresh sources to show updated last_scraped_at
      setTimeout(() => {
        loadSourcesForTopic(currentTopicId);
      }, 2000);

    } catch (error) {
      console.error('Error gathering from source:', error);
      toast({
        title: "Content Gathering Failed",
        description: `Failed to gather content from "${source.source_name}": ${error.message || 'Unknown error'}`,
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
      const scraperFunction = getScraperFunction(currentTopic.topic_type, activeSources[0]?.feed_url);
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
        title: `Bulk Content Gathering Complete`,
        description: `${successCount}/${activeSources.length} sources processed | ${summary}`,
        variant: totalStored > 0 ? "default" : "destructive"
      });

      // Refresh sources after gathering
      setTimeout(() => {
        loadSourcesForTopic(currentTopicId);
      }, 3000);

    } catch (error) {
      console.error('Error bulk content gathering:', error);
      toast({
        title: "Bulk Gathering Failed",
        description: "Some sources may have failed to gather content",
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

  const getSourceSuccessRate = (source: ContentSource): number => {
    const rule = sourceRules.find(r => r.source_url === source.feed_url);
    
    // If we have automation rule data, use it
    if (rule && (rule.success_count + rule.failure_count) > 0) {
      return Math.round((rule.success_count / (rule.success_count + rule.failure_count)) * 100);
    }
    
    // If source has scraped articles but no success rate, calculate based on activity
    if (source.articles_scraped && source.articles_scraped > 0) {
      // If they have articles but no recorded failures, assume high success
      return source.success_rate || 85; // Default to 85% for active sources
    }
    
    // Fall back to database success rate or 0
    return source.success_rate || 0;
  };

  const getSourceStatusBadge = (source: ContentSource) => {
    const rule = sourceRules.find(r => r.source_url === source.feed_url);
    
    // Manual deactivation takes precedence
    if (!source.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }

    // Use actual database success rates and activity, not stale automation errors
    const successRate = source.success_rate || 0;
    const articlesScraped = source.articles_scraped || 0;
    const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
    const daysSinceLastScrape = lastScraped ? 
      Math.floor((Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const hasRecentActivity = daysSinceLastScrape <= 7;
    
    // Enhanced status logic prioritizing actual performance
    
    // Healthy: High success rate AND recent activity
    if (successRate >= 80 && hasRecentActivity && articlesScraped > 0) {
      return <Badge variant="default" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400">Healthy</Badge>;
    }
    
    // Active: Moderate success rate with recent activity
    if (successRate >= 50 && hasRecentActivity && articlesScraped > 0) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400">Active</Badge>;
    }

    // No Content: Successfully connects but finds no relevant articles
    if (successRate >= 70 && articlesScraped === 0 && hasRecentActivity) {
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400">No Content</Badge>;
    }

    // Idle: No recent activity but not failed
    if (daysSinceLastScrape > 7 && daysSinceLastScrape < 30 && !rule?.last_error) {
      return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-900/20 dark:text-gray-400">Idle</Badge>;
    }

    // Poor: Low success rate but some activity
    if (successRate > 0 && successRate < 50 && hasRecentActivity) {
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400">Poor</Badge>;
    }

    // Failed: Recent errors AND poor performance OR very stale
    if ((rule?.last_error && successRate < 30) || daysSinceLastScrape > 30) {
      return <Badge variant="destructive">Failed</Badge>;
    }

    // New: No data yet
    return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-400">New</Badge>;
  };

  const getRecommendedFrequency = (successRate: number): number => {
    if (successRate >= 80) return 12; // High success - can scrape more frequently
    if (successRate >= 50) return 24; // Moderate success - daily scraping
    if (successRate > 0) return 48;   // Poor success - every 2 days
    return 12; // New source - start with 12 hours
  };

  const updateSourceAutomationRule = async (sourceUrl: string, updates: Partial<SourceAutomationRule>) => {
    if (!user || !currentTopicId) return;

    try {
      const { data: existing, error: checkError } = await supabase
        .from('scraping_automation')
        .select('id')
        .eq('topic_id', currentTopicId)
        .eq('source_url', sourceUrl)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        const { error: updateError } = await supabase
          .from('scraping_automation')
          .update(updates)
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('scraping_automation')
          .insert({
            topic_id: currentTopicId,
            source_url: sourceUrl,
            scrape_frequency_hours: updates.scrape_frequency_hours || 12,
            is_active: updates.is_active ?? true,
            success_count: updates.success_count || 0,
            failure_count: updates.failure_count || 0
          });

        if (insertError) throw insertError;
      }

      await loadSourceAutomationRules(currentTopicId);
    } catch (error) {
      console.error('Error updating source automation rule:', error);
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
                    {scrapingAll ? 'Gathering All...' : 'Gather All'}
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
                {sources.map((source) => {
                  const successRate = getSourceSuccessRate(source);
                  const rule = sourceRules.find(r => r.source_url === source.feed_url);
                  const recommendedFreq = getRecommendedFrequency(successRate);
                  const currentFreq = rule?.scrape_frequency_hours || 12;
                  const needsFrequencyAdjustment = successRate > 0 && successRate < 50 && currentFreq < 24;

                  return (
                    <div key={source.id} className="p-4 border rounded-lg space-y-3">
                      {/* Source Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{source.source_name}</h4>
                          {getSourceStatusBadge(source)}
                          {source.credibility_score && (
                            <Badge variant="outline">
                              {source.credibility_score}% credible
                            </Badge>
                          )}
                          {successRate > 0 && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              {successRate >= 80 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : successRate < 50 ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : null}
                              {successRate}% success
                            </Badge>
                          )}
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
                              {scrapingSource === source.id ? 'Gathering...' : 'Gather'}
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

                      {/* Source Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Articles</p>
                          <p className="font-medium">{source.articles_scraped || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Last scraped</p>
                          <p className="font-medium">{source.last_scraped_at ? new Date(source.last_scraped_at).toLocaleDateString() : 'Never'}</p>
                        </div>
                        {rule && (
                          <>
                            <div className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span>{rule.success_count} success</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-red-500" />
                              <span>{rule.failure_count} failed</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Frequency Management */}
                      {source.feed_url && (
                        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-md">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">Gather every:</Label>
                            <Select 
                              value={currentFreq.toString()}
                              onValueChange={(value) => {
                                if (source.feed_url) {
                                  updateSourceAutomationRule(source.feed_url, {
                                    scrape_frequency_hours: parseInt(value)
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="w-24 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="12">12h</SelectItem>
                                <SelectItem value="24">24h</SelectItem>
                                <SelectItem value="48">48h</SelectItem>
                                <SelectItem value="72">72h</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {needsFrequencyAdjustment && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2 text-amber-600">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-sm">Consider {recommendedFreq}h frequency</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Poor success rate. Longer intervals may improve reliability.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {successRate > 0 && successRate >= 80 && currentFreq > 12 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2 text-green-600">
                                    <Info className="w-4 h-4" />
                                    <span className="text-sm">Can gather more frequently</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>High success rate allows more frequent gathering.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}

                      {/* URL and Error */}
                      <div className="space-y-2">
                        {source.feed_url && (
                          <a 
                            href={source.feed_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 truncate"
                          >
                            {source.feed_url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {rule?.last_error && (
                          <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                            <strong>Last Error:</strong> {rule.last_error}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Smart Automation Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Smart Automation
              </CardTitle>
              <CardDescription>
                Intelligent gathering optimizes frequency based on success rates. 
                Individual source frequencies can be adjusted above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {sourceRules.filter(r => {
                      const rate = r.success_count + r.failure_count > 0 ? 
                        (r.success_count / (r.success_count + r.failure_count)) * 100 : 0;
                      return rate >= 80;
                    }).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Healthy Sources</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {sourceRules.filter(r => {
                      const rate = r.success_count + r.failure_count > 0 ? 
                        (r.success_count / (r.success_count + r.failure_count)) * 100 : 0;
                      return rate < 80 && rate >= 50;
                    }).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Warning Sources</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {sourceRules.filter(r => {
                      const rate = r.success_count + r.failure_count > 0 ? 
                        (r.success_count / (r.success_count + r.failure_count)) * 100 : 0;
                      return rate < 50 && rate > 0;
                    }).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Failing Sources</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Global Automation</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable automatic gathering for all active sources
                    </p>
                  </div>
                  <Button
                    onClick={() => updateAutomationSettings({
                      ...automationSettings,
                      is_active: !automationSettings.is_active
                    })}
                    variant={automationSettings.is_active ? 'default' : 'outline'}
                  >
                    {automationSettings.is_active ? 'Automation On' : 'Automation Off'}
                  </Button>
                </div>

                {automationSettings.is_active && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-blue-600" />
                      <p className="text-sm font-medium text-blue-800">Smart Mode Active</p>
                    </div>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• High-performing sources (80%+ success) gather every 12 hours</li>
                      <li>• Moderate sources (50-79% success) gather daily</li>
                      <li>• Poor sources (&lt;50% success) gather every 2 days</li>
                      <li>• Failed sources are paused automatically</li>
                    </ul>
                  </div>
                )}

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-800">Optimal Gathering Practices</p>
                  </div>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>• Minimum 12-hour intervals prevent rate limiting</li>
                    <li>• Longer intervals for unreliable sources improve success rates</li>
                    <li>• Monitor source health and adjust frequencies accordingly</li>
                  </ul>
                </div>
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
