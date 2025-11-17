import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  RotateCw,
  Eye,
  XCircle,
  Loader2,
  ExternalLink,
  Edit
} from 'lucide-react';
import { getScraperFunction, createScraperRequestBody } from '@/lib/scraperUtils';
import { StatusIndicator } from '@/components/StatusIndicator';
import { GatheringProgressIndicator } from '@/components/GatheringProgressIndicator';
import { ProcessingStatusIndicator } from '@/components/ProcessingStatusIndicator';
import { SourceHealthIndicator } from '@/components/SourceHealthIndicator';
import { SourceStorySparkline } from '@/components/SourceStorySparkline';
import { SourceHealthDot } from '@/components/SourceHealthDot';
import { LiveStoriesCount } from '@/components/LiveStoriesCount';
import { CooldownMinimal } from '@/components/CooldownMinimal';
import { SourceActionsMenu } from '@/components/SourceActionsMenu';
import { useDailyContentAvailability } from '@/hooks/useDailyContentAvailability';

interface ContentSource {
  id: string;
  source_name: string;
  feed_url: string | null;
  canonical_domain: string | null;
  is_active: boolean | null;
  region: string | null;
  content_type: string | null;
  is_whitelisted: boolean | null;
  is_blacklisted: boolean | null;
  scrape_frequency_hours: number | null;
  last_scraped_at: string | null;
  topic_id: string | null;
  scraping_config?: any | null;
  is_gathering?: boolean;
  stories_published_7d?: number;
  stories_gathered_7d?: number;
  stories_published_total?: number;
  last_story_date?: string | null;
  consecutive_failures?: number;
  total_failures?: number;
  last_failure_at?: string | null;
  last_failure_reason?: string | null;
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
  arcInfo?: {
    arcCompatible: boolean;
    arcSite?: string;
    sectionPath?: string;
    articlesFound?: number;
    testSuccess?: boolean;
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
  const [editingFeedUrl, setEditingFeedUrl] = useState<string>('');
  const [editTrustContentRelevance, setEditTrustContentRelevance] = useState(false);
  const [editTrustedMaxAgeDays, setEditTrustedMaxAgeDays] = useState(1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [gatheringSource, setGatheringSource] = useState<string | null>(null);
  const [gatheringAll, setGatheringAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testingSource, setTestingSource] = useState<string | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    sourceId: string;
    sourceName: string;
    articleCount: number;
  } | null>(null);
  
  // Daily content availability for topic mode
  const { 
    availability, 
    loading: availabilityLoading, 
    refreshAvailability, 
    runContentMonitor 
  } = useDailyContentAvailability(mode === 'topic' && topicId ? topicId : '');

  const runCleanup = async (operation: 'cleanup_legacy_orphaned') => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('cleanup_orphaned_legacy_sources');

      if (error) throw error;
      
      const result = data as { success: boolean; message?: string; error?: string };
      
      if (result.success) {
        toast({
          title: "Cleanup Successful",
          description: result.message || "Legacy source cleanup completed successfully",
        });
        // Reload sources to reflect changes
        loadSources();
      } else {
        throw new Error(result.error || 'Unknown error during cleanup');
      }
    } catch (error: any) {
      console.error('Legacy cleanup failed:', error);
      toast({
        title: "Cleanup Failed",
        description: error.message || "Failed to run legacy source cleanup",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const [newSource, setNewSource] = useState({
    source_name: '',
    feed_url: '',
    region: region || 'general',
    scrape_frequency_hours: 24,
    content_type: 'news',
    trustContentRelevance: false,
    trustedMaxAgeDays: 1,
  });

  useEffect(() => {
    loadSources();
    if (mode === 'topic' && topicId) {
      loadTopicInfo(topicId);
      // Manual content availability check only - auto-run removed to prevent collision with manual scrapes
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
        // For topic mode, use the new stats function
        const { data: statsData, error: statsError } = await supabase.rpc('get_topic_source_stats', {
          p_topic_id: topicId
        });

        if (statsError) {
          console.error('Error loading topic source stats:', statsError);
          throw statsError;
        }
        
        if (!statsData || statsData.length === 0) {
          // Fallback: show basic topic sources when stats are not yet available
          const { data: basicData, error: basicError } = await supabase.rpc('get_topic_sources', {
            p_topic_id: topicId
          });

          if (basicError) {
            console.error('Error loading basic topic sources:', basicError);
            setSources([]);
            return;
          }

          // ✅ Fetch full content_sources data to get scraping_config
          const sourceIds = (basicData || []).map((ts: any) => ts.source_id);
          const { data: fullSources } = await supabase
            .from('content_sources')
            .select('id, scraping_config')
            .in('id', sourceIds);
          
          const sourcesMap = new Map(fullSources?.map(s => [s.id, s]) || []);

          const basicTransformed = (basicData || []).map((ts: any) => {
            const fullSource = sourcesMap.get(ts.source_id);
            return {
              id: ts.source_id,
              source_name: ts.source_name,
              feed_url: ts.feed_url,
              canonical_domain: ts.canonical_domain,
              is_active: ts.is_active,
              topic_id: topicId,
              region: null,
              content_type: null,
              is_whitelisted: null,
              is_blacklisted: null,
              scrape_frequency_hours: null,
              last_scraped_at: null,
              scraping_config: fullSource?.scraping_config || {},  // ✅ Include scraping_config
            };
          });

          // Sort: active sources first, then alphabetically
          basicTransformed.sort((a, b) => {
            if (a.is_active !== b.is_active) {
              return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
            }
            return (a.source_name || '').localeCompare(b.source_name || '');
          });
          setSources(basicTransformed);
          return;
        }

        // Transform the stats data to match ContentSource interface
        const transformedSources = (statsData || []).map((stat: any) => ({
          id: stat.source_id,
          source_name: stat.source_name,
          feed_url: stat.feed_url,
          canonical_domain: stat.canonical_domain,
          is_active: stat.is_active,
          is_gathering: stat.is_gathering,
          stories_published_7d: stat.stories_published_7d,
          stories_published_total: stat.stories_published_total,
          last_story_date: stat.last_story_date,
          topic_id: topicId,
          region: null,
          content_type: null,
          is_whitelisted: null,
          is_blacklisted: null,
          scrape_frequency_hours: null,
          last_scraped_at: null,
        }));
        
        // Merge with basic topic sources to ensure we include newly linked sources
        // and prefer the accurate feed_url and scraping_config from content_sources
        const { data: basicData } = await supabase.rpc('get_topic_sources', { p_topic_id: topicId });
        
        // ✅ Fetch full content_sources data to get scraping_config
        const sourceIds = (basicData || []).map((ts: any) => ts.source_id);
        const { data: fullSources } = await supabase
          .from('content_sources')
          .select('id, scraping_config, consecutive_failures, total_failures, last_failure_at, last_failure_reason, last_scraped_at, scrape_frequency_hours')
          .in('id', sourceIds);
        
        const sourcesMap = new Map(fullSources?.map(s => [s.id, s]) || []);
        
        const basicTransformed = (basicData || []).map((ts: any) => {
          const fullSource = sourcesMap.get(ts.source_id);
          return {
            id: ts.source_id,
            source_name: ts.source_name,
            feed_url: ts.feed_url,
            canonical_domain: ts.canonical_domain,
            is_active: ts.is_active,
            topic_id: topicId,
            region: null,
            content_type: null,
            is_whitelisted: null,
            is_blacklisted: null,
            scrape_frequency_hours: fullSource?.scrape_frequency_hours || null,
            last_scraped_at: fullSource?.last_scraped_at || null,
            scraping_config: fullSource?.scraping_config || {},  // ✅ Use scraping_config from content_sources
            consecutive_failures: fullSource?.consecutive_failures,
            total_failures: fullSource?.total_failures,
            last_failure_at: fullSource?.last_failure_at,
            last_failure_reason: fullSource?.last_failure_reason,
          };
        });

        // Build merged list keyed by source id. Start with basic (to keep correct feed_url),
        // then overlay stats to add metrics without overriding feed_url.
        const mergedMap = new Map<string, ContentSource>();
        for (const b of basicTransformed) mergedMap.set(b.id, b);
        for (const s of transformedSources) {
          const existing = mergedMap.get(s.id);
          mergedMap.set(s.id, {
            ...(existing || s),
            // keep accurate feed_url from basic when present
            feed_url: existing?.feed_url ?? s.feed_url,
            // include stats-specific fields
            is_gathering: s.is_gathering,
            stories_published_7d: s.stories_published_7d,
            stories_published_total: s.stories_published_total,
            last_story_date: s.last_story_date,
          });
        }
        const merged = Array.from(mergedMap.values());
        
        // Query for gathered articles count in last 7 days
        if (topicId) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          const { data: gatheredData } = await supabase
            .from('topic_articles')
            .select('source_id')
            .eq('topic_id', topicId)
            .gte('created_at', sevenDaysAgo.toISOString());
          
          // Count articles per source
          const gatheredCounts = new Map<string, number>();
          (gatheredData || []).forEach((article) => {
            const count = gatheredCounts.get(article.source_id) || 0;
            gatheredCounts.set(article.source_id, count + 1);
          });
          
          // Add gathered counts to merged sources
          merged.forEach((source) => {
            source.stories_gathered_7d = gatheredCounts.get(source.id) || 0;
          });
        }
        
        // Sort: active sources first, then alphabetically
        merged.sort((a, b) => {
          if (a.is_active !== b.is_active) {
            return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
          }
          return (a.source_name || '').localeCompare(b.source_name || '');
        });
        setSources(merged);
      } else {
        // For global mode, show only sources that are actively linked to topics via topic_sources
        if (mode === 'global') {
          const { data, error } = await supabase
            .from('content_sources')
            .select(`
              *,
              topic_sources!inner(topic_id, is_active, source_config)
            `)
            .eq('is_active', true)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          const sorted = (data || []).sort((a, b) => {
            if (a.is_active !== b.is_active) {
              return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
            }
            return (a.source_name || '').localeCompare(b.source_name || '');
          });
          setSources(sorted);
        } else {
          // For region mode, use original approach (legacy sources not linked to topics)
          let query = supabase.from('content_sources').select('*');

          if (mode === 'region' && region) {
            query = query.eq('region', region).is('topic_id', null);
          }

          const { data, error } = await query;

          if (error) throw error;
          const sorted = (data || []).sort((a, b) => {
            if (a.is_active !== b.is_active) {
              return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
            }
            return (a.source_name || '').localeCompare(b.source_name || '');
          });
          setSources(sorted);
        }
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
        const arcMessage = data.arcInfo?.arcCompatible 
          ? ` (✓ Arc API compatible - fast scraping available)`
          : '';
        toast({
          title: 'Source Validated',
          description: `Source appears to be working correctly${arcMessage}`,
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
        // Check for exact duplicate feed URL already linked to topic
        const { data: topicSourcesCheck } = await supabase
          .rpc('get_topic_sources', { p_topic_id: topicId });
        
        const duplicateUrl = topicSourcesCheck?.find((ts: any) => 
          ts.feed_url === normalizedUrl
        );
        
        if (duplicateUrl) {
          toast({
            title: 'Already Added',
            description: `This URL is already linked to this topic. Try a different URL from the same domain (e.g., ${normalizedUrl.replace(/\/[^/]*$/, '/different-section')})`,
            variant: 'destructive',
          });
          setLoading(false);
          // Keep form open so user can modify the URL
          return;
        }
        
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
        const { data: existingLinks } = await supabase
          .from('topic_sources')
          .select('id, is_active')
          .eq('topic_id', topicId)
          .eq('source_id', existingSource.id);

        const activeLink = existingLinks?.find(link => link.is_active);
        const inactiveLink = existingLinks?.find(link => !link.is_active);

        if (activeLink) {
          toast({
            title: 'Already Added',
            description: `The URL "${normalizedUrl}" is already linked to this topic as "${existingSource.source_name}"`,
            variant: 'destructive',
          });
          setLoading(false);
          // Keep form open so user can modify the URL
          return;
        }

        if (inactiveLink) {
          const reactivate = window.confirm(
            `Source "${existingSource.source_name}" already exists but is disabled for this topic. Reactivate it?`
          );
          if (reactivate) {
            const { error } = await supabase
              .from('topic_sources')
              .update({ is_active: true })
              .eq('id', inactiveLink.id);

            if (error) throw error;
            
            toast({
              title: 'Source Reactivated',
              description: `"${existingSource.source_name}" has been reactivated for this topic`,
            });
            
            loadSources();
            onSourcesChange();
            setShowAddForm(false);
            return;
          } else {
            return;
          }
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
          // Create new source with Arc API config if detected
          const scrapingConfig: any = {};
          
          if (validationResult?.arcInfo?.arcCompatible) {
            scrapingConfig.arcCompatible = true;
            scrapingConfig.sectionPath = validationResult.arcInfo.sectionPath;
            scrapingConfig.arcSite = validationResult.arcInfo.arcSite;
            scrapingConfig.discoveredAt = new Date().toISOString();
            console.log('✅ Storing Arc API config in source:', scrapingConfig);
          }
          
          // Add trusted source configuration
          if (newSource.trustContentRelevance) {
            scrapingConfig.trust_content_relevance = true;
            scrapingConfig.trusted_max_age_days = newSource.trustedMaxAgeDays;
            console.log('🔓 Storing trusted source config:', { trust_content_relevance: true, trusted_max_age_days: newSource.trustedMaxAgeDays });
          }
          
          const sourceData = {
            source_name: newSource.source_name.trim(),
            feed_url: normalizedUrl,
            canonical_domain: domain,
            scrape_frequency_hours: newSource.scrape_frequency_hours,
            content_type: newSource.content_type,
            is_active: true,
            is_whitelisted: true,
            is_blacklisted: false,
            region: currentTopic?.region || region,
            scraping_config: Object.keys(scrapingConfig).length > 0 ? scrapingConfig : null
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
        scrape_frequency_hours: 24,
        content_type: 'news',
        trustContentRelevance: false,
        trustedMaxAgeDays: 1,
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

      // ✅ Enhanced success message showing exact trusted state
      const isTrusted = updates.scraping_config?.trust_content_relevance === true;
      const ageWindow = updates.scraping_config?.trusted_max_age_days;
      
      let description = 'Source updated successfully';
      if (isTrusted && ageWindow) {
        description = `✅ Source is now TRUSTED with ${ageWindow}-day bypass active`;
      } else if (updates.scraping_config?.trust_content_relevance === false) {
        description = '✅ Source is now UNTRUSTED (keyword filtering enabled)';
      }

      toast({
        title: 'Success',
        description,
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
    // Get source details for confirmation
    const source = sources.find(s => s.id === sourceId);
    
    if (mode === 'topic' && topicId) {
      // For topic mode, just unlink (safe operation)
      if (!confirm(`Remove "${sourceName}" from this topic?\n\nThe source will remain available for other topics.`)) {
        return;
      }
    } else {
      // For global/region mode, permanent deletion with strong warnings
      const articleCount = source?.stories_published_total || 0;
      const confirmMessage = `⚠️ PERMANENTLY DELETE "${sourceName}"?\n\nThis source has ${articleCount} articles.\nThis action CANNOT be undone.\n\nType DELETE to confirm:`;
      
      const userInput = window.prompt(confirmMessage);
      if (userInput !== 'DELETE') {
        toast({
          title: 'Deletion Cancelled',
          description: 'Source was not deleted',
        });
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
        // For global/region mode, attempt permanent deletion
        const { error } = await supabase
          .from('content_sources')
          .delete()
          .eq('id', sourceId);

        if (error) {
          // Check if it's our protection trigger or foreign key violation
          if (error.message?.includes('still linked to active topics') || 
              error.message?.includes('Cannot delete source')) {
            toast({
              title: 'Cannot Delete',
              description: 'Source is linked to active topics. Remove all topic associations first.',
              variant: 'destructive',
            });
          } else if (error.code === '23503') {
            toast({
              title: 'Cannot Delete',
              description: 'Source has associated data. Remove topic links first.',
              variant: 'destructive',
            });
          } else {
            throw error;
          }
          return;
        }

        toast({
          title: 'Success',
          description: `Source "${sourceName}" permanently deleted`,
        });
      }

      loadSources();
      onSourcesChange();
    } catch (error: any) {
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

  const handleScrapeSource = async (source: ContentSource, options?: { forceRescrape?: boolean }) => {
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
        title: options?.forceRescrape ? 'Force Rescrape Started' : 'Content Gathering Started',
        description: `Now gathering articles from ${source.source_name}...`,
      });

      let scraperFunction = 'universal-scraper';
      let requestBody: any = {
        feedUrl: source.feed_url,
        sourceId: source.id,
        region: source.region || 'general',
        forceRescrape: options?.forceRescrape || false
      };

      // Use topic-aware scraper if this is a topic source
      if (currentTopic) {
        scraperFunction = getScraperFunction(currentTopic.topic_type, source.feed_url);
        requestBody = createScraperRequestBody(
          currentTopic.topic_type,
          source.feed_url,
          { topicId, sourceId: source.id, region: currentTopic.region || source.region, forceRescrape: options?.forceRescrape || false }
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

      // Handle cooldown skips (not a failure!)
      if (data?.status === 'skipped_cooldown') {
        toast({
          title: '⏸️ Source Recently Scraped',
          description: data.message || `${source.source_name} was recently scraped. Use force rescrape to bypass cooldown.`,
          variant: 'default'
        });
        loadSources();
        onSourcesChange();
        return;
      }

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
        
        // Enhanced toast messaging with specific queue information
        if (stored > 0) {
          toast({
            title: 'Content Gathering Complete',
            description: `Discovered ${totalFound} articles • ${stored} added to arrivals queue${duplicates > 0 ? ` • ${duplicates} duplicates skipped` : ''}`,
            variant: 'default'
          });
        } else if (totalFound > 0) {
          toast({
            title: 'Gathering Complete - Articles Filtered',
            description: `Discovered ${totalFound} articles • 0 added to arrivals queue (filtered for relevance)`,
            variant: 'default'
          });
        } else {
          toast({
            title: 'Gathering Complete - No Articles Found',
            description: `0 articles discovered from ${source.source_name} • 0 added to arrivals queue`,
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
          ? `⚠️ Having trouble connecting to ${source.source_name}. The source may be temporarily unavailable.`
          : error.message || '⚠️ Connection issue with this source. Please check the URL and try again.',
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
        title: 'Bulk Gathering Complete',
        description: `Discovered ${totalArticlesFound} articles • ${totalArticlesScraped} added to arrivals queue${failedSources > 0 ? ` • ${failedSources} sources failed` : ''}`,
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
    if (!source.is_active) {
      return <Badge variant="secondary" className="text-xs">🔴 Disabled</Badge>;
    }
    
    if (hasConnectionIssues(source)) {
      return <Badge variant="destructive" className="text-xs">🔴 Connection Issues</Badge>;
    }
    
    if (!source.last_story_date) {
      return <Badge variant="outline" className="text-xs">⚪ No Stories Yet</Badge>;
    }
    
    const daysSinceLastStory = Math.floor(
      (Date.now() - new Date(source.last_story_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceLastStory > 7) {
      return <Badge variant="outline" className="text-xs">🟡 Stale ({daysSinceLastStory}d)</Badge>;
    }
    
    if ((source.stories_published_7d || 0) === 0) {
      return <Badge variant="outline" className="text-xs">🟡 No Recent Stories</Badge>;
    }
    
    return <Badge variant="default" className="text-xs">🟢 Healthy</Badge>;
  };

  const hasConnectionIssues = (source: ContentSource) => {
    // Check for consecutive failures
    return (source.consecutive_failures || 0) >= 3 || source.is_blacklisted || !source.is_active;
  };

  const isSourceOnCooldown = (source: ContentSource): boolean => {
    if (!source.last_scraped_at || !source.scrape_frequency_hours) {
      return false;
    }
    const lastScraped = new Date(source.last_scraped_at).getTime();
    const cooldownMs = source.scrape_frequency_hours * 60 * 60 * 1000;
    const nextAvailable = lastScraped + cooldownMs;
    return Date.now() < nextAvailable;
  };

  const handleTestSource = async (source: ContentSource) => {
    if (!source.feed_url) return;
    
    try {
      setTestingSource(source.id);
      await validateSource(source.feed_url);
      
      if (validationResult?.success) {
        // Reset failure counters on successful test
        const { error } = await supabase
          .from('content_sources')
          .update({
            consecutive_failures: 0,
            last_failure_at: null,
            last_failure_reason: null
          })
          .eq('id', source.id);
        
        if (error) throw error;
        
        toast({
          title: 'Source Test Successful',
          description: `${source.source_name} is now responding correctly`,
        });
        
        loadSources();
      }
    } catch (error) {
      console.error('Source test failed:', error);
    } finally {
      setTestingSource(null);
    }
  };

  const handleReactivateSource = async (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId);
    if (!source) return;

    try {
      if (mode === 'topic' && topicId) {
        // Reactivate in topic_sources junction table
        const { error } = await supabase
          .from('topic_sources')
          .update({ is_active: true })
          .eq('topic_id', topicId)
          .eq('source_id', sourceId);
        
        if (error) throw error;
      } else {
        // Reactivate in content_sources table
        const { error } = await supabase
          .from('content_sources')
          .update({
            is_active: true,
            consecutive_failures: 0,
            last_failure_at: null,
            last_failure_reason: null
          })
          .eq('id', sourceId);
        
        if (error) throw error;
      }
      
      toast({
        title: 'Source Reactivated',
        description: `${source.source_name} has been reactivated`,
      });
      
      loadSources();
    } catch (error) {
      console.error('Failed to reactivate source:', error);
      toast({
        title: 'Error',
        description: 'Failed to reactivate source',
        variant: 'destructive',
      });
    }
  };

  const handleCheckNewContent = async () => {
    
    try {
      const success = await runContentMonitor();
      if (success) {
        toast({
          title: 'Content Check Complete',
          description: 'New content availability has been updated',
        });
      } else {
        toast({
          title: 'Content Check Failed',
          description: 'Could not check for new content',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check for new content',
        variant: 'destructive',
      });
    }
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
          {mode === 'global' && (
            <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
              Only showing sources actively linked to topics. Use "Clean Legacy Sources" to remove orphaned sources.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {mode === 'global' && (
            <Button
              onClick={() => runCleanup('cleanup_legacy_orphaned')}
              disabled={isLoading}
              variant="destructive"
              size="sm"
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isLoading ? 'Cleaning...' : 'Clean Legacy Sources'}
            </Button>
          )}
          <Button
            onClick={() => setShowDisabled(!showDisabled)}
            variant="outline"
            size="sm"
          >
            <Eye className="w-4 h-4 mr-2" />
            {showDisabled ? 'Hide' : 'Show'} Disabled
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 w-4 mr-2" />
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

            <div className="flex items-center space-x-2 pt-4 border-t">
              <Checkbox
                id="trust-relevance"
                checked={newSource.trustContentRelevance}
                onCheckedChange={(checked) => setNewSource({ ...newSource, trustContentRelevance: checked as boolean })}
              />
              <label
                htmlFor="trust-relevance"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                🔓 Bypass keyword filtering (trusted source)
              </label>
            </div>
            
            {newSource.trustContentRelevance && (
              <div className="pt-4 space-y-2">
                <Label htmlFor="trusted-age">Content Age Window</Label>
                <Select
                  value={newSource.trustedMaxAgeDays.toString()}
                  onValueChange={(value) => setNewSource({ ...newSource, trustedMaxAgeDays: parseInt(value) })}
                >
                  <SelectTrigger id="trusted-age">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="2">Last 48 hours</SelectItem>
                    <SelectItem value="3">Last 3 days</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-yellow-600 dark:text-yellow-500">
                  ⚠️ Trusted sources process ALL content from index pages - keep date range tight to manage volume and costs
                </p>
              </div>
            )}

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
        {sources.filter(s => showDisabled || s.is_active).map((source) => (
          <Card key={source.id}>
            <CardContent className="p-4 sm:p-6">
              {/* Desktop: Single-row layout */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Left: Health Dot + Name + Domain */}
                <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
                  <SourceHealthDot
                    isActive={source.is_active || false}
                    consecutiveFailures={source.consecutive_failures || 0}
                    totalFailures={source.total_failures || 0}
                    lastStoryDate={source.last_story_date || null}
                    storiesPublished7d={source.stories_published_7d || 0}
                    storiesGathered7d={source.stories_gathered_7d || 0}
                    lastFailureReason={source.last_failure_reason}
                    isBlacklisted={source.is_blacklisted || false}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{source.source_name}</h3>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{source.canonical_domain}</span>
                    </div>
                  </div>
                </div>

                {/* Center: Sparkline Chart (most important) */}
                {mode === 'topic' && topicId && source.is_active && (
                  <div className="flex-1 min-w-0">
                    <SourceStorySparkline 
                      sourceId={source.id} 
                      topicId={topicId}
                    />
                  </div>
                )}

                {/* Right: Metrics + Actions */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                  {/* Trusted badge - only show if set */}
                  {source.scraping_config?.trust_content_relevance && (
                    <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 text-xs">
                      🔓 {source.scraping_config.trusted_max_age_days || 1}d
                    </Badge>
                  )}

                  {/* Live Stories Count */}
                  {mode === 'topic' && (
                    <LiveStoriesCount count={source.stories_published_7d || 0} />
                  )}

                  {/* Cooldown Status */}
                  <CooldownMinimal
                    lastScrapedAt={source.last_scraped_at}
                    scrapeFrequencyHours={source.scrape_frequency_hours}
                  />

                  {/* Primary Action: Gather Button */}
                  {source.is_active ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleScrapeSource(source)}
                      disabled={gatheringSource === source.id || !source.feed_url || isSourceOnCooldown(source)}
                      title={isSourceOnCooldown(source) ? "Source on cooldown - use Force Rescrape to override" : "Gather content (respects cooldown)"}
                      className="flex-shrink-0"
                    >
                      {gatheringSource === source.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Play className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Gather</span>
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleReactivateSource(source.id)}
                      className="flex-shrink-0"
                    >
                      <Play className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Reactivate</span>
                    </Button>
                  )}

                  {/* Secondary Actions Menu */}
                  <SourceActionsMenu
                    sourceId={source.id}
                    feedUrl={source.feed_url}
                    isActive={source.is_active || false}
                    onForceRescrape={() => handleScrapeSource(source, { forceRescrape: true })}
                    onToggle={(checked) => handleUpdateSource(source.id, { is_active: checked })}
                    onEdit={() => {
                      setEditingSource(source);
                      setEditingFeedUrl(source.feed_url || '');
                      setEditTrustContentRelevance(source.scraping_config?.trust_content_relevance || false);
                      setEditTrustedMaxAgeDays(source.scraping_config?.trusted_max_age_days || 1);
                    }}
                    onDelete={() => handleDeleteSource(source.id, source.source_name)}
                    disabled={gatheringSource === source.id}
                  />
                </div>
              </div>

              {/* Source Health Indicator - only for connection issues */}
              {source.is_active && (source.consecutive_failures || 0) >= 3 && (
                <div className="mt-3">
                  <SourceHealthIndicator
                    consecutiveFailures={source.consecutive_failures || 0}
                    totalFailures={source.total_failures || 0}
                    lastFailureAt={source.last_failure_at}
                    lastFailureReason={source.last_failure_reason}
                    isActive={source.is_active || false}
                    onTest={() => handleTestSource(source)}
                    onReactivate={() => handleReactivateSource(source.id)}
                    testing={testingSource === source.id}
                  />
                </div>
              )}

              {source.last_error && (source.consecutive_failures || 0) < 3 && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-400">
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

      {/* Edit Source Settings Dialog */}
      <Dialog open={!!editingSource} onOpenChange={(open) => !open && setEditingSource(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Source Settings</DialogTitle>
            <DialogDescription>
              Update settings for {editingSource?.source_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-feed-url">Feed URL</Label>
              <Input
                id="edit-feed-url"
                value={editingFeedUrl}
                onChange={(e) => setEditingFeedUrl(e.target.value)}
                placeholder="https://example.com/feed"
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="edit-trust-relevance"
                  checked={editTrustContentRelevance}
                  onCheckedChange={(checked) => setEditTrustContentRelevance(checked as boolean)}
                />
                <div className="space-y-1">
                  <Label htmlFor="edit-trust-relevance" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Bypass keyword filtering (Trusted Source)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Process ALL content from this source without keyword matching
                  </p>
                </div>
              </div>

              {editTrustContentRelevance && (
                <div className="ml-7 space-y-3">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      ⚠️ Trusted sources process ALL content - keep date range tight
                    </AlertDescription>
                  </Alert>
                  
                  <div>
                    <Label htmlFor="edit-max-age">Maximum Content Age</Label>
                    <Select
                      value={editTrustedMaxAgeDays.toString()}
                      onValueChange={(value) => setEditTrustedMaxAgeDays(parseInt(value))}
                    >
                      <SelectTrigger id="edit-max-age" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Last 24 hours</SelectItem>
                        <SelectItem value="2">Last 48 hours</SelectItem>
                        <SelectItem value="3">Last 3 days</SelectItem>
                        <SelectItem value="7">Last 7 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Only articles published within this timeframe will be processed
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSource(null)}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (editingSource && editingFeedUrl.trim()) {
                  await handleUpdateSource(editingSource.id, { 
                    feed_url: editingFeedUrl.trim(),
                    scraping_config: {
                      ...editingSource.scraping_config,
                      trust_content_relevance: editTrustContentRelevance,
                      trusted_max_age_days: editTrustedMaxAgeDays
                    }
                  });
                  toast({
                    title: 'Source Updated',
                    description: `Settings for ${editingSource.source_name} have been updated`,
                  });
                  setEditingSource(null);
                  loadSources();
                }
              }}
              disabled={!editingFeedUrl.trim() || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};