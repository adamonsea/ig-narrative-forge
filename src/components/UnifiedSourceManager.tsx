import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Plus, 
  Trash2, 
  Globe, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  BarChart3,
  Settings,
  Download,
  Play,
  RefreshCw,
  Eye,
  XCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { getScraperFunction, createScraperRequestBody } from '@/lib/scraperUtils';
import { EnhancedSourceStatusBadge } from '@/components/EnhancedSourceStatusBadge';

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
  topic_id: string | null;
  scraping_method: string | null;
  success_count?: number;
  failure_count?: number;
  last_error?: string | null;
}

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  region?: string;
}

interface ValidationResult {
  success: boolean;
  isAccessible: boolean;
  isValidRSS?: boolean;
  contentType?: string;
  hasRecentContent?: boolean;
  articleCount?: number;
  error?: string;
  warnings: string[];
  scraperTest?: {
    success: boolean;
    articlesFound: number;
    error?: string;
  };
}

interface UnifiedSourceManagerProps {
  mode: 'global' | 'topic' | 'region';
  topicId?: string;
  region?: string;
  onSourcesChange: () => void;
  showAddForm?: boolean;
  title?: string;
  description?: string;
}

export const UnifiedSourceManager = ({ 
  mode, 
  topicId, 
  region, 
  onSourcesChange, 
  showAddForm: externalShowAddForm = false,
  title,
  description
}: UnifiedSourceManagerProps) => {
  const { toast } = useToast();
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [showAddForm, setShowAddForm] = useState(externalShowAddForm);
  const [editingSource, setEditingSource] = useState<ContentSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [gatheringSource, setGatheringSource] = useState<string | null>(null);
  const [gatheringAll, setGatheringAll] = useState(false);
  
  const [newSource, setNewSource] = useState({
    source_name: '',
    feed_url: '',
    region: region || 'general',
    credibility_score: 70,
    scrape_frequency_hours: 24,
    content_type: 'news',
  });

  useEffect(() => {
    loadSources();
    if (mode === 'topic' && topicId) {
      loadTopicInfo(topicId);
    }
  }, [mode, topicId, region]);

  useEffect(() => {
    setShowAddForm(externalShowAddForm);
  }, [externalShowAddForm]);

  const loadTopicInfo = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, topic_type, is_active, region')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      if (data) {
        setCurrentTopic({
          ...data,
          topic_type: data.topic_type as 'regional' | 'keyword'
        });
      }
    } catch (error) {
      console.error('Error loading topic info:', error);
    }
  };

  const loadSources = async () => {
    try {
      setLoading(true);

      if (mode === 'topic' && topicId) {
        // For topic mode, use the new junction table function
        const { data, error } = await supabase.rpc('get_topic_sources', {
          p_topic_id: topicId
        });

        if (error) throw error;
        
        // Transform the RPC result to match ContentSource interface
        const transformedSources = (data || []).map((source: any) => ({
          id: source.source_id,
          source_name: source.source_name,
          feed_url: source.feed_url,
          canonical_domain: source.canonical_domain,
          credibility_score: source.credibility_score,
          is_active: source.is_active,
          articles_scraped: source.articles_scraped,
          last_scraped_at: source.last_scraped_at,
          // Add additional fields that might be needed
          region: null,
          content_type: null,
          is_whitelisted: null,
          is_blacklisted: null,
          scrape_frequency_hours: null,
          topic_id: topicId, // For compatibility
          scraping_method: null,
          success_rate: null,
          avg_response_time_ms: null,
          source_config: source.source_config
        }));
        
        setSources(transformedSources);
      } else {
        // For non-topic modes, use original approach
        let query = supabase.from('content_sources').select('*');

        if (mode === 'region' && region) {
          query = query.eq('region', region).is('topic_id', null);
        } else if (mode === 'global') {
          query = query.is('topic_id', null);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        setSources(data || []);
      }
    } catch (error) {
      console.error('Error loading sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load sources',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const validateSource = async (url: string) => {
    if (!url.trim()) return;

    try {
      setValidating(true);
      setValidationResult(null);

      const { data, error } = await supabase.functions.invoke('validate-content-source', {
        body: {
          url: url.trim(),
          sourceType: 'News',
          topicType: currentTopic?.topic_type || 'regional',
          region: region || currentTopic?.region || 'general',
          topicId: topicId || undefined
        }
      });

      if (error) throw error;

      setValidationResult(data);
      
      if (data.success) {
        toast({
          title: 'Source Validated',
          description: 'Source appears to be working correctly',
        });
      } else {
        toast({
          title: 'Validation Issues',
          description: data.error || 'Source may have issues',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: 'Validation Failed',
        description: 'Could not validate source',
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
    }
  };

  const normalizeUrl = (url: string): string => {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL: URL must be a non-empty string');
    }

    let normalizedUrl = url.trim();
    
    if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
      try {
        new URL(normalizedUrl);
        return normalizedUrl;
      } catch (error) {
        throw new Error(`Invalid URL format: ${normalizedUrl}`);
      }
    }

    normalizedUrl = 'https://' + normalizedUrl;
    
    try {
      new URL(normalizedUrl);
      return normalizedUrl;
    } catch (error) {
      const httpUrl = 'http://' + url.trim();
      try {
        new URL(httpUrl);
        return httpUrl;
      } catch (httpError) {
        throw new Error(`Invalid URL format: cannot normalize "${url}"`);
      }
    }
  };

  const extractDomainFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown-domain';
    }
  };

  const handleAddSource = async () => {
    if (!newSource.source_name.trim() || !newSource.feed_url.trim()) {
      toast({
        title: 'Error',
        description: 'Source name and feed URL are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const normalizedUrl = normalizeUrl(newSource.feed_url.trim());
      const domain = extractDomainFromUrl(normalizedUrl);
      
      if (mode === 'topic' && topicId) {
        // First, check if source already exists globally
        const { data: existingSource, error: checkError } = await supabase
          .from('content_sources')
          .select('id, source_name')
          .eq('feed_url', normalizedUrl)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') throw checkError;

        let sourceId: string;

        if (existingSource) {
          // Source exists, check if already linked to this topic
          const { data: existingLink } = await supabase
            .from('topic_sources')
            .select('id')
            .eq('topic_id', topicId)
            .eq('source_id', existingSource.id)
            .eq('is_active', true)
            .maybeSingle();

          if (existingLink) {
            toast({
              title: 'Source Already Added',
              description: 'This source is already linked to this topic',
              variant: 'destructive',
            });
            return;
          }

          // Link existing source to topic
          const { error: linkError } = await supabase.rpc('add_source_to_topic', {
            p_topic_id: topicId,
            p_source_id: existingSource.id,
            p_source_config: {
              added_via: 'unified_source_manager',
              added_at: new Date().toISOString(),
              original_name: newSource.source_name.trim()
            }
          });

          if (linkError) throw linkError;
          sourceId = existingSource.id;

          toast({
            title: 'Success',
            description: `Existing source "${existingSource.source_name}" linked to topic`,
          });
        } else {
          // Create new source
          const sourceData = {
            source_name: newSource.source_name.trim(),
            feed_url: normalizedUrl,
            canonical_domain: domain,
            credibility_score: newSource.credibility_score,
            scrape_frequency_hours: newSource.scrape_frequency_hours,
            content_type: newSource.content_type,
            is_active: true,
            is_whitelisted: true,
            is_blacklisted: false,
            region: currentTopic?.region || region
            // Note: No topic_id - we use junction table now
          };

          const { data: newSourceData, error: createError } = await supabase
            .from('content_sources')
            .insert(sourceData)
            .select('id')
            .single();

          if (createError) throw createError;
          sourceId = newSourceData.id;

          // Link new source to topic
          const { error: linkError } = await supabase.rpc('add_source_to_topic', {
            p_topic_id: topicId,
            p_source_id: sourceId,
            p_source_config: {
              added_via: 'unified_source_manager',
              added_at: new Date().toISOString(),
              created_with_topic: true
            }
          });

          if (linkError) throw linkError;

          toast({
            title: 'Success',
            description: 'New content source created and linked to topic',
          });
        }

        // Trigger initial scraping for the source
        try {
          if (currentTopic) {
            const scraperFunction = getScraperFunction(currentTopic.topic_type, normalizedUrl);
            const requestBody = createScraperRequestBody(
              currentTopic.topic_type,
              normalizedUrl,
              { topicId, sourceId, region: currentTopic.region || region }
            );
            
            await supabase.functions.invoke(scraperFunction, {
              body: requestBody
            });
          }
        } catch (scrapeError) {
        console.error('Initial content gathering failed:', scrapeError);
          // Don't show error to user as source was still added successfully
        }
      } else {
        // For non-topic mode, use the original approach
        const sourceData = {
          source_name: newSource.source_name.trim(),
          feed_url: normalizedUrl,
          canonical_domain: domain,
          credibility_score: newSource.credibility_score,
          scrape_frequency_hours: newSource.scrape_frequency_hours,
          content_type: newSource.content_type,
          is_active: true,
          is_whitelisted: true,
          is_blacklisted: false,
          ...(mode === 'region' && region && { region: newSource.region }),
          ...(mode === 'global' && { region: newSource.region }),
        };

        const { error } = await supabase
          .from('content_sources')
          .insert(sourceData);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Content source added successfully',
        });

        // Trigger initial scraping
        try {
          await supabase.functions.invoke('universal-scraper', {
            body: {
              feedUrl: normalizedUrl,
              sourceId: undefined,
              region: region || 'general'
            }
          });
        } catch (scrapeError) {
          console.error('Initial content gathering failed:', scrapeError);
        }
      }

      setNewSource({
        source_name: '',
        feed_url: '',
        region: region || 'general',
        credibility_score: 70,
        scrape_frequency_hours: 24,
        content_type: 'news',
      });
      setShowAddForm(false);
      setValidationResult(null);
      loadSources();
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
    try {
      setLoading(true);
      const { error } = await supabase
        .from('content_sources')
        .update(updates)
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Source updated successfully',
      });

      loadSources();
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

  const handleDeleteSource = async (sourceId: string, sourceName: string) => {
    if (mode === 'topic' && topicId) {
      // For topic mode, remove source from topic (don't delete the source itself)
      if (!confirm(`Are you sure you want to remove "${sourceName}" from this topic? The source will remain available for other topics.`)) {
        return;
      }
    } else {
      // For global/region mode, delete the entire source
      if (!confirm(`Are you sure you want to delete "${sourceName}"? This action cannot be undone.`)) {
        return;
      }
    }

    try {
      setLoading(true);
      
      if (mode === 'topic' && topicId) {
        // Remove source from topic using junction table
        const { error } = await supabase.rpc('remove_source_from_topic', {
          p_topic_id: topicId,
          p_source_id: sourceId
        });

        if (error) throw error;

        toast({
          title: 'Success',
          description: `Source "${sourceName}" removed from topic`,
        });
      } else {
        // For global/region mode, delete entire source (original logic)
        
        // Check for existing articles
        const { data: articleCount, error: countError } = await supabase
          .from('articles')
          .select('id', { count: 'exact', head: true })
          .eq('source_id', sourceId);

        if (countError) throw countError;

        const hasArticles = (articleCount as any)?.count > 0;
        
        if (hasArticles) {
          // Orphan articles by setting source_id to null
          const { error: updateError } = await supabase
            .from('articles')
            .update({ source_id: null })
            .eq('source_id', sourceId);

          if (updateError) throw updateError;
        }

        // Delete the source (this will cascade delete topic_sources entries)
        const { error } = await supabase
          .from('content_sources')
          .delete()
          .eq('id', sourceId);

        if (error) throw error;

        toast({
          title: 'Success',
          description: hasArticles 
            ? `Source "${sourceName}" deleted and ${(articleCount as any)?.count} articles orphaned`
            : `Source "${sourceName}" deleted successfully`,
        });
      }

      loadSources();
      onSourcesChange();
    } catch (error) {
      console.error('Error deleting source:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove/delete source',
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

    try {
      setGatheringSource(source.id);
      
      toast({
        title: 'Content Gathering Started',
        description: `Now gathering articles from ${source.source_name}...`,
      });

      let scraperFunction = 'universal-scraper';
      let requestBody: any = {
        feedUrl: source.feed_url,
        sourceId: source.id,
        region: source.region || 'general'
      };

      // Use topic-aware scraper if this is a topic source
      if (currentTopic) {
        scraperFunction = getScraperFunction(currentTopic.topic_type, source.feed_url);
        requestBody = createScraperRequestBody(
          currentTopic.topic_type,
          source.feed_url,
          { topicId, sourceId: source.id, region: currentTopic.region || source.region }
        );
        
        console.log(`🔧 Scraper routing decision for ${source.source_name}:`);
        console.log(`   - Topic type: ${currentTopic.topic_type}`);
        console.log(`   - URL: ${source.feed_url}`);
        console.log(`   - Selected scraper: ${scraperFunction}`);
        console.log(`   - Request body:`, requestBody);
      }

      const { data, error } = await supabase.functions.invoke(scraperFunction, {
        body: requestBody
      });

      if (error) throw error;

      if (data?.success) {
        const totalFound = data.articlesFound || 0;
        const stored = data.articlesStored || 0;
        const duplicates = data.duplicatesSkipped || 0;
        const filtered = data.filteredForRelevance || 0;
        
        let description = `Found ${totalFound} articles using ${data.method}`;
        
        if (stored > 0) {
          description += `, stored ${stored} new articles`;
        } else {
          description += `, stored 0 articles`;
        }
        
        if (duplicates > 0) {
          description += `, skipped ${duplicates} duplicates`;
        }
        
        if (filtered > 0) {
          description += `, filtered ${filtered} for low relevance`;
        }
        
        // Improved toast messaging based on results
        if (stored > 0) {
          toast({
            title: 'Content Gathering Complete',
            description,
            variant: 'default'
          });
        } else if (totalFound > 0) {
          toast({
            title: 'Gathering Complete - Articles Filtered',
            description: `Found ${totalFound} articles but they weren't relevant enough for your feed. Consider adjusting your topic keywords or sources.`,
            variant: 'default'
          });
        } else {
          toast({
            title: 'Gathering Complete - No Articles Found',
            description: `No articles were discovered from ${source.source_name}. The source may need time to publish new content.`,
            variant: 'default'
          });
        }
      } else {
        throw new Error(data?.error || 'Content gathering failed');
      }

      loadSources();
      onSourcesChange();
    } catch (error) {
      console.error('Content gathering error:', error);
      toast({
        title: 'Content Gathering Failed',
        description: error.message?.includes('Failed to fetch') 
          ? `Unable to connect to ${source.source_name}. The source may be temporarily unavailable.`
          : error.message || 'Failed to gather content from source',
        variant: 'destructive',
      });
    } finally {
      setGatheringSource(null);
    }
  };

  const handleScrapeAll = async () => {
    const activeSources = sources.filter(s => s.is_active && s.feed_url);
    
    if (activeSources.length === 0) {
      toast({
        title: 'No Sources',
        description: 'No active sources found to gather from',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGatheringAll(true);
      let totalArticlesFound = 0;
      let totalArticlesScraped = 0;
      let failedSources = 0;

      toast({
        title: 'Bulk Content Gathering Started',
        description: `Now gathering from ${activeSources.length} sources...`,
      });

      for (const source of activeSources) {
        try {
          let scraperFunction = 'universal-scraper';
          let requestBody: any = {
            feedUrl: source.feed_url,
            sourceId: source.id,
            region: source.region || 'general'
          };

          if (currentTopic) {
            scraperFunction = getScraperFunction(currentTopic.topic_type, source.feed_url!);
            requestBody = createScraperRequestBody(
              currentTopic.topic_type,
              source.feed_url!,
              { topicId, sourceId: source.id, region: currentTopic.region || source.region }
            );
          }

          const { data, error } = await supabase.functions.invoke(scraperFunction, {
            body: requestBody
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

        // Small delay between sources
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      toast({
        title: 'Bulk Scraping Complete',
        description: `Found ${totalArticlesFound} articles, scraped ${totalArticlesScraped} relevant ones. ${failedSources} sources failed.`,
      });

      loadSources();
      onSourcesChange();
    } catch (error) {
      console.error('Bulk content gathering error:', error);
      toast({
        title: 'Bulk Content Gathering Failed',
        description: error.message || 'Failed to complete bulk content gathering',
        variant: 'destructive',
      });
    } finally {
      setGatheringAll(false);
    }
  };

  const getSourceHealthBadge = (source: ContentSource) => {
    // Handle blacklisted sources separately (special case)
    if (source.is_blacklisted) {
      return <Badge variant="destructive">Blacklisted</Badge>;
    }
    
    // Use the unified EnhancedSourceStatusBadge for all other cases
    return <EnhancedSourceStatusBadge source={source} automationLastError={source.last_error} />;
  };

  const hasConnectionIssues = (source: ContentSource) => {
    if (!source.is_active || source.is_blacklisted) return false;
    
    const successRate = source.success_rate || 0;
    const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
    const daysSinceLastScrape = lastScraped ? 
      Math.floor((Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    
    // Connection issues if: has recent errors AND poor performance OR very stale
    return (source.last_error && successRate < 30) || daysSinceLastScrape > 30;
  };

  const getDisplayTitle = () => {
    if (title) return title;
    if (mode === 'topic' && currentTopic) return `${currentTopic.name} Sources`;
    if (mode === 'region' && region) return `${region} Sources`;
    return 'Content Sources';
  };

  const getDisplayDescription = () => {
    if (description) return description;
    if (mode === 'topic') return 'Manage content sources for this topic';
    if (mode === 'region') return `Manage content sources for ${region} region`;
    return 'Manage all content sources with enhanced validation and health monitoring';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{getDisplayTitle()}</h2>
          <p className="text-muted-foreground">{getDisplayDescription()}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleScrapeAll}
            disabled={gatheringAll || sources.filter(s => s.is_active).length === 0}
            variant="outline"
          >
            {gatheringAll ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Gather All Active
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
              Add and validate content sources with enhanced error detection
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
                <div className="flex gap-2">
                  <Input
                    id="feed-url"
                    placeholder="https://example.com OR https://example.com/feed.xml"
                    value={newSource.feed_url}
                    onChange={(e) => setNewSource(prev => ({ ...prev, feed_url: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => validateSource(newSource.feed_url)}
                    disabled={!newSource.feed_url.trim() || validating}
                  >
                    {validating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Works with any website - RSS feeds, news sites, or regular web pages
                </p>
              </div>
            </div>

            {/* Validation Results */}
            {validationResult && (
              <Alert className={validationResult.success ? "" : "border-orange-500"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">
                      {validationResult.success ? "✅ Source validated successfully" : "⚠️ Source validation issues found"}
                    </p>
                    {validationResult.error && (
                      <p className="text-sm text-red-600">{validationResult.error}</p>
                    )}
                    {validationResult.warnings.length > 0 && (
                      <div className="text-sm">
                        <p className="font-medium">Warnings:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {validationResult.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {validationResult.scraperTest && (
                      <p className="text-sm">
                        Test scraping: {validationResult.scraperTest.success ? "✅" : "❌"} 
                        {validationResult.scraperTest.articlesFound} articles found
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mode !== 'topic' && (
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
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="national">National</SelectItem>
                      <SelectItem value="international">International</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddSource} 
                disabled={loading || !newSource.source_name.trim() || !newSource.feed_url.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Source
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources List */}
      <div className="grid gap-4">
        {sources.map((source) => (
          <Card key={source.id} className={hasConnectionIssues(source) ? 'opacity-60 bg-muted/30' : ''}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{source.source_name}</h3>
                    {getSourceHealthBadge ? (
                      <EnhancedSourceStatusBadge 
                        source={source} 
                        isGathering={gatheringSource === source.id}
                      />
                    ) : (
                      getSourceHealthBadge(source)
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      <span>{source.canonical_domain}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" />
                      <span>{source.articles_scraped || 0} articles</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>
                        {source.last_scraped_at 
                          ? new Date(source.last_scraped_at).toLocaleDateString()
                          : 'Never scraped'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleScrapeSource(source)}
                    disabled={gatheringSource === source.id || !source.feed_url}
                  >
                    {gatheringSource === source.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  
                  <Switch
                    checked={source.is_active || false}
                    onCheckedChange={(checked) => handleUpdateSource(source.id, { is_active: checked })}
                  />
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSource(source.id, source.source_name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  
                  {source.feed_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(source.feed_url!, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {source.last_error && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-700">
                    <strong>Last Error:</strong> {source.last_error}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {sources.length === 0 && !loading && (
          <div className="text-center py-12">
            <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No sources configured yet. Add your first source above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};