import { useState, useEffect } from 'react';
import { AddSourceSheet, type NewNewsSource } from '@/components/sources/AddSourceSheet';
import { SourceShelves } from '@/components/sources/SourceShelves';
import { BackfillFold } from '@/components/sources/SourcePanelParts';
import { detectSourceKind, isEventsSourceKind } from '@/lib/whatsOn';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkspaceDrawer } from '@/components/workspace/WorkspaceDrawer';
import { InfoHint } from '@/components/ui/editorial';
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
  XCircle,
  Loader2,
  ExternalLink,
  Edit,
  Sparkles
} from 'lucide-react';
import { getScraperFunction, createScraperRequestBody } from '@/lib/scraperUtils';
import { SourceHealthIndicator } from '@/components/SourceHealthIndicator';
import { SourceHealthDot } from '@/components/SourceHealthDot';
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
  avg_daily_stories?: number;
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
  // For AI source discovery
  topicName?: string;
  keywords?: string[];
  topicType?: 'regional' | 'keyword';
  // Stats for contextual prompts
  articleCount?: number;
}

export const UnifiedSourceManager = ({ 
  mode, 
  topicId, 
  region, 
  onSourcesChange, 
  showAddForm: externalShowAddForm = false,
  title,
  description,
  topicName,
  keywords,
  topicType,
  articleCount = 0
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
  const [lastGatherAllAt, setLastGatherAllAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [backfillMaxAgeDays, setBackfillMaxAgeDays] = useState(30);
  const [sourceToBackfill, setSourceToBackfill] = useState<string | null>(null);
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
          title: 'Cleaned up',
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
        title: "Couldn't clean up",
        description: error.message || "Failed to run legacy source cleanup",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const [eventSourcesReload, setEventSourcesReload] = useState(0);
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
        
        // Query for gathered articles count in last 7 days and calculate average daily stories
        if (topicId) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          const { data: gatheredData } = await supabase
            .from('topic_articles')
            .select('source_id, created_at')
            .eq('topic_id', topicId)
            .gte('created_at', sevenDaysAgo.toISOString());
          
          // Count articles per source
          const gatheredCounts = new Map<string, number>();
          const firstArticleDate = new Map<string, Date>();
          
          (gatheredData || []).forEach((article) => {
            const count = gatheredCounts.get(article.source_id) || 0;
            gatheredCounts.set(article.source_id, count + 1);
            
            // Track first (earliest) article date for this source
            const articleDate = new Date(article.created_at);
            const existing = firstArticleDate.get(article.source_id);
            if (!existing || articleDate < existing) {
              firstArticleDate.set(article.source_id, articleDate);
            }
          });
          
          // Calculate average daily stories for each source
          merged.forEach((source) => {
            const gathered = gatheredCounts.get(source.id) || 0;
            source.stories_gathered_7d = gathered;
            
            // Calculate average daily stories
            if (gathered > 0 && firstArticleDate.has(source.id)) {
              const firstDate = firstArticleDate.get(source.id)!;
              const now = new Date();
              const daysActive = Math.max(1, Math.ceil((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
              source.avg_daily_stories = gathered / daysActive;
            } else {
              source.avg_daily_stories = 0;
            }
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
        title: 'Something went wrong',
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
          title: 'Link works',
          description: `Source appears to be working correctly${arcMessage}`,
        });
      } else {
        toast({
          title: 'Link has problems',
          description: data.error || 'Source may have issues',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: "Couldn't check the link",
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

  const handleAddSource = async (override?: NewNewsSource): Promise<boolean> => {
    const src = override
      ? { ...newSource, source_name: override.name, feed_url: override.url, trustContentRelevance: override.trust, trustedMaxAgeDays: override.trustDays }
      : newSource;
    if (!src.source_name.trim() || !src.feed_url.trim()) {
      toast({
        title: 'Something went wrong',
        description: 'Source name and feed URL are required',
        variant: 'destructive',
      });
      return false;
    }

    try {
      setLoading(true);
      const normalizedUrl = normalizeUrl(src.feed_url.trim());
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
            title: 'Already added',
            description: `This URL is already linked to this topic. Try a different URL from the same domain (e.g., ${normalizedUrl.replace(/\/[^/]*$/, '/different-section')})`,
            variant: 'destructive',
          });
          setLoading(false);
          // Keep form open so user can modify the URL
          return false;
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
            title: 'Already added',
            description: `The URL "${normalizedUrl}" is already linked to this topic as "${existingSource.source_name}"`,
            variant: 'destructive',
          });
          setLoading(false);
          // Keep form open so user can modify the URL
          return false;
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
              title: 'Restored',
              description: `"${existingSource.source_name}" has been reactivated for this topic`,
            });
            
        await loadSources();
        onSourcesChange();
        setShowAddForm(false);
        return true;
          } else {
            return false;
          }
        }

          // Link existing source to topic
          const { error: linkError } = await supabase.rpc('add_source_to_topic', {
            p_topic_id: topicId,
            p_source_id: existingSource.id,
            p_source_config: {
              added_via: 'unified_source_manager',
              added_at: new Date().toISOString(),
              original_name: src.source_name.trim()
            }
          });

          if (linkError) throw linkError;
          sourceId = existingSource.id;

          toast({
            title: 'Done',
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
          if (src.trustContentRelevance) {
            scrapingConfig.trust_content_relevance = true;
            scrapingConfig.trusted_max_age_days = src.trustedMaxAgeDays;
            console.log('🔓 Storing trusted source config:', { trust_content_relevance: true, trusted_max_age_days: src.trustedMaxAgeDays });
          }
          
          const sourceData = {
            source_name: src.source_name.trim(),
            feed_url: normalizedUrl,
            canonical_domain: domain,
            scrape_frequency_hours: src.scrape_frequency_hours,
            content_type: src.content_type,
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
            title: 'Done',
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
          source_name: src.source_name.trim(),
          feed_url: normalizedUrl,
          canonical_domain: domain,
          scrape_frequency_hours: src.scrape_frequency_hours,
          content_type: src.content_type,
          is_active: true,
          is_whitelisted: true,
          is_blacklisted: false,
          ...(mode === 'region' && region && { region: src.region }),
          ...(mode === 'global' && { region: src.region }),
        };

        const { error } = await supabase
          .from('content_sources')
          .insert(sourceData);

        if (error) throw error;

        toast({
          title: 'Done',
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
      await loadSources();
      onSourcesChange();
      return true;
    } catch (error) {
      console.error('Error adding source:', error);
      toast({
        title: 'Something went wrong',
        description: error.message || 'Failed to add content source',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    return false;
  };

  const handleUpdateSource = async (sourceId: string, updates: Partial<ContentSource>) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('content_sources')
        .update(updates as any)
        .eq('id', sourceId);

      if (error) throw error;

      // CRITICAL FIX: In topic mode, also update topic_sources.source_config
      // This ensures the scraper uses the updated feed_url
      if (mode === 'topic' && topicId && updates.feed_url) {
        const { data: existingConfig } = await supabase
          .from('topic_sources')
          .select('source_config')
          .eq('topic_id', topicId)
          .eq('source_id', sourceId)
          .single();

        const currentConfig = (existingConfig?.source_config as any) || {};
        const updatedConfig = {
          ...currentConfig,
          feed_url: updates.feed_url,
        };

        const { error: topicSourceError } = await supabase
          .from('topic_sources')
          .update({
            source_config: updatedConfig,
            updated_at: new Date().toISOString(),
          })
          .eq('topic_id', topicId)
          .eq('source_id', sourceId);

        if (topicSourceError) {
          console.error('Error updating topic_sources config:', topicSourceError);
          // Don't throw - content_sources was updated successfully
        }
      }

      // ✅ Enhanced success message showing exact trusted state
      const isTrusted = updates.scraping_config?.trust_content_relevance === true;
      const ageWindow = updates.scraping_config?.trusted_max_age_days;
      
      let description = 'Source updated successfully';
      if (isTrusted && ageWindow) {
        description = `Trusted for the last ${ageWindow} ${ageWindow === 1 ? 'day' : 'days'}.`;
      } else if (updates.scraping_config?.trust_content_relevance === false) {
        description = 'Relevance check is back on.';
      }

      toast({
        title: 'Done',
        description,
      });

      loadSources();
      onSourcesChange();
    } catch (error) {
      console.error('Error updating source:', error);
      toast({
        title: 'Something went wrong',
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
      const confirmMessage = `Delete "${sourceName}"? This cannot be undone. It has ${articleCount} articles.\n\nType DELETE to confirm:`;
      
      const userInput = window.prompt(confirmMessage);
      if (userInput !== 'DELETE') {
        toast({
          title: 'Not removed',
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
          title: 'Done',
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
              title: "Can't remove",
              description: 'Source is linked to active topics. Remove all topic associations first.',
              variant: 'destructive',
            });
          } else if (error.code === '23503') {
            toast({
              title: "Can't remove",
              description: 'Source has associated data. Remove topic links first.',
              variant: 'destructive',
            });
          } else {
            throw error;
          }
          return;
        }

        toast({
          title: 'Done',
          description: `Source "${sourceName}" permanently deleted`,
        });
      }

      loadSources();
      onSourcesChange();
    } catch (error: any) {
      console.error('Error deleting source:', error);
      toast({
        title: 'Something went wrong',
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
        title: 'Something went wrong',
        description: 'No URL configured for this source',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGatheringSource(source.id);
      
      toast({
        title: options?.forceRescrape ? 'Gathering now' : 'Content Gathering Started',
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
          title: 'Checked recently',
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
            title: 'Gathered',
            description: `Discovered ${totalFound} articles • ${stored} sent to the Story pool${duplicates > 0 ? ` • ${duplicates} duplicates skipped` : ''}`,
            variant: 'default'
          });
        } else if (totalFound > 0) {
          toast({
            title: 'Nothing relevant',
            description: `Found ${totalFound}, none relevant`,
            variant: 'default'
          });
        } else {
          toast({
            title: 'Nothing new',
            description: `Nothing new from ${source.source_name}`,
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
        title: "Couldn't gather",
        description: error.message?.includes('Failed to fetch') 
          ? `Couldn't reach ${source.source_name}. Try again later.`
          : error.message || "Couldn't reach this source. Check the link.",
        variant: 'destructive',
      });
    } finally {
      setGatheringSource(null);
    }
  };

  // Re-render the "12m ago" label every 30s
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Simple Gather All with sensible defaults (7 days, no force rescrape)
  const handleGatherAllSimple = async () => {
    if (!topicId) return;
    
    const activeSources = sources.filter(s => s.is_active && s.feed_url);
    
    if (activeSources.length === 0) {
      toast({
        title: 'No sources',
        description: 'No active sources found to gather from',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGatheringAll(true);
      
      toast({
        title: 'Gathering',
        description: `Fetching recent content from ${activeSources.length} sources...`,
      });

      const { data, error } = await supabase.functions.invoke('universal-topic-automation', {
        body: {
          topicIds: [topicId],
          force: false,
          dryRun: false,
          maxAgeDays: 7
        }
      });

      if (error) throw error;

      setLastGatherAllAt(Date.now());
      setNowTick(Date.now());
      toast({
        title: 'Gathered',
        description: 'New stories go to the Story pool.',
      });

      loadSources();
      onSourcesChange();
    } catch (error: any) {
      console.error('Gather all error:', error);
      toast({
        title: "Couldn't gather",
        description: error.message || 'Failed to gather content',
        variant: 'destructive',
      });
    } finally {
      setGatheringAll(false);
    }
  };

  // Backfill with custom age window
  const handleBackfill = async (maxAgeDays: number, sourceId?: string) => {
    if (!topicId) return;
    
    try {
      setGatheringAll(true);
      
      toast({
        title: 'Gathering older stories',
        description: `Gathering content from the last ${maxAgeDays} days...`,
      });

      const { data, error } = await supabase.functions.invoke('universal-topic-automation', {
        body: {
          topicIds: [topicId],
          force: true,
          dryRun: false,
          maxAgeDays,
          sourceId // Optional: only backfill specific source
        }
      });

      if (error) throw error;

      toast({
        title: 'Older stories gathered',
        description: `Historical content has been gathered`,
      });

      loadSources();
      onSourcesChange();
      setShowBackfillModal(false);
      setSourceToBackfill(null);
    } catch (error: any) {
      console.error('Backfill error:', error);
      toast({
        title: "Couldn't gather older stories",
        description: error.message || 'Failed to backfill content',
        variant: 'destructive',
      });
    } finally {
      setGatheringAll(false);
    }
  };

  const handleScrapeAll = async () => {
    const activeSources = sources.filter(s => s.is_active && s.feed_url);
    
    if (activeSources.length === 0) {
      toast({
        title: 'No sources',
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
        title: 'Gathering',
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
        title: 'Gathered',
        description: `Discovered ${totalArticlesFound} articles • ${totalArticlesScraped} sent to the Story pool${failedSources > 0 ? ` • ${failedSources} sources failed` : ''}`,
      });

      loadSources();
      onSourcesChange();
    } catch (error) {
      console.error('Bulk content gathering error:', error);
      toast({
        title: "Couldn't gather",
        description: error.message || 'Failed to complete bulk content gathering',
        variant: 'destructive',
      });
    } finally {
      setGatheringAll(false);
    }
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
          title: 'Link works',
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

  const handleReactivateSource = async (sourceId: string, withBackfill: boolean = false) => {
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
        title: 'Restored',
        description: `${source.source_name} has been reactivated`,
      });
      
      loadSources();

      // If backfill requested, open backfill modal with this source pre-selected
      if (withBackfill && mode === 'topic' && topicId) {
        setSourceToBackfill(sourceId);
        setShowBackfillModal(true);
      }
    } catch (error) {
      console.error('Failed to reactivate source:', error);
      toast({
        title: 'Something went wrong',
        description: 'Failed to reactivate source',
        variant: 'destructive',
      });
    }
  };

  /** Archive a source for this feed only: it stops being gathered here and moves to the Archived fold. */
  const handleArchiveSource = async (source: ContentSource) => {
    if (!topicId) return;
    const { error } = await supabase
      .from('topic_sources')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('topic_id', topicId)
      .eq('source_id', source.id);
    if (error) {
      toast({ title: "Couldn't archive", description: 'Please try again.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Archived', description: `${source.source_name} won't be gathered. Restore it any time from Archived.` });
    loadSources();
    onSourcesChange();
  };

  const handleCheckNewContent = async () => {
    
    try {
      const success = await runContentMonitor();
      if (success) {
        toast({
          title: 'Checked',
          description: 'New content availability has been updated',
        });
      } else {
        toast({
          title: "Couldn't check",
          description: 'Could not check for new content',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Something went wrong',
        description: 'Failed to check for new content',
        variant: 'destructive',
      });
    }
  };

  // Events sources (what's-on pages, calendar feeds) share the one add box; the link decides.
  const isEventsLink = mode === 'topic' && !!topicId && !!newSource.feed_url.trim() && isEventsSourceKind(detectSourceKind(newSource.feed_url));

  const getDisplayTitle = () => {
    if (title) return title;
    if (mode === 'topic') return 'Sources';
    if (mode === 'region' && region) return `${region} Sources`;
    return 'Content Sources';
  };

  const getDisplayDescription = () => {
    if (mode === 'topic') return '';
    if (mode === 'region') return `Manage content sources for ${region} region`;
    return 'Manage all content sources with enhanced validation and health monitoring';
  };

  const displayDescription = getDisplayDescription();

  // "12m ago": the latest of this session's Gather all and the sources' own last read
  const lastGatheredAt = Math.max(
    lastGatherAllAt ?? 0,
    ...sources
      .filter(s => s.is_active && s.last_scraped_at)
      .map(s => new Date(s.last_scraped_at as string).getTime())
      .filter(t => Number.isFinite(t)),
  );
  const lastGatheredLabel = lastGatheredAt > 0 ? formatAgo(nowTick - lastGatheredAt) : null;

  return (
    <div className="space-y-6">
      {/* Header: one line — title left, Gather all + Add source right */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">{getDisplayTitle()}</h2>
          {mode !== 'topic' && displayDescription && (
            <p className="text-muted-foreground">{displayDescription}</p>
          )}
          {mode === 'global' && (
            <p className="text-sm font-medium text-attention-foreground">
              Only showing sources actively linked to topics. Use "Clean Legacy Sources" to remove orphaned sources.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === 'topic' && topicId && sources.some(s => s.is_active) && (
            <div className="flex items-center gap-1">
              {lastGatheredLabel && !gatheringAll && (
                <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                  {lastGatheredLabel}
                  {lastGatheredLabel !== 'now' && <span className="hidden sm:inline"> ago</span>}
                </span>
              )}
              {gatheringAll && (
                <span className="hidden text-sm text-muted-foreground sm:inline">Gathering…</span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleGatherAllSimple}
                    disabled={gatheringAll}
                    aria-label="Gather all now"
                    className="disabled:opacity-100"
                  >
                    <RefreshCw className={`h-4 w-4 ${gatheringAll ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Gather all now</TooltipContent>
              </Tooltip>
            </div>
          )}
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
          <Button onClick={() => setShowAddForm(true)} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add source
          </Button>
        </div>
      </div>

      {/* Contextual Backfill Prompt - for new topics with few articles */}
      {mode === 'topic' && topicId && articleCount < 10 && sources.length > 0 && (
        <div className="rounded-xl bg-muted p-4">
          <BackfillFold onRun={(days) => handleBackfill(days)} />
        </div>
      )}

      {/* Gather older stories for one source */}
      <WorkspaceDrawer
        open={showBackfillModal}
        onOpenChange={(open) => { setShowBackfillModal(open); if (!open) setSourceToBackfill(null); }}
        title="Gather older stories"
        srDescription="Choose how far back to gather."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowBackfillModal(false); setSourceToBackfill(null); }}>Cancel</Button>
            <Button onClick={() => handleBackfill(backfillMaxAgeDays, sourceToBackfill || undefined)} disabled={gatheringAll}>
              <Download className="mr-2 h-4 w-4" />
              Gather
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="backfill-age" className="text-sm font-medium">How far back</Label>
          <Select value={backfillMaxAgeDays.toString()} onValueChange={(v) => setBackfillMaxAgeDays(Number(v))}>
            <SelectTrigger id="backfill-age"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="100">Last 100 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </WorkspaceDrawer>

      {/* Add source: link → kind → that kind's fields, with "Find sources" on step one */}
      {mode === 'topic' && topicId && (
        <AddSourceSheet
          open={showAddForm}
          onOpenChange={setShowAddForm}
          topicId={topicId}
          finder={topicName ? {
            topicId,
            topicName,
            description: description || '',
            keywords: keywords || [],
            topicType: topicType || 'keyword',
            region,
            onSourceAdded: () => { loadSources(); onSourcesChange(); },
          } : null}
          onAddNews={(v) => handleAddSource(v)}
          onEventsSaved={() => setEventSourcesReload((n) => n + 1)}
        />
      )}

      <Separator />

      {/* Add Source Form (legacy global/region screens) */}
      {mode !== 'topic' && showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add a source</CardTitle>
            <CardDescription>
              News sites, RSS feeds, what's-on pages and calendar feeds. We work out which from the link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`grid grid-cols-1 gap-4 ${isEventsLink ? "" : "md:grid-cols-2"}`}>
              <div className={isEventsLink ? "hidden" : ""}>
                <Label htmlFor="source-name">Source Name *</Label>
                <Input
                  id="source-name"
                  placeholder="e.g., BBC News"
                  value={newSource.source_name}
                  onChange={(e) => setNewSource(prev => ({ ...prev, source_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="feed-url">Link *</Label>
                <div className="flex gap-2">
                  <Input
                    id="feed-url"
                    placeholder="Paste a news site, RSS feed or what's-on page"
                    value={newSource.feed_url}
                    onChange={(e) => setNewSource(prev => ({ ...prev, feed_url: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className={isEventsLink ? "hidden" : ""}
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
                {isEventsLink && (
                  <p className="mt-2 text-sm text-muted-foreground">What comes through goes to your Desk.</p>
                )}
              </div>
            </div>

            {!isEventsLink && (<>
            {/* Validation Results */}
            {validationResult && (
              <Alert className={validationResult.success ? "" : "border-attention"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">
                      {validationResult.success ? "Source looks good" : "Source needs a look"}
                    </p>
                    {validationResult.error && (
                      <p className="text-sm text-destructive">{validationResult.error}</p>
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
                        {validationResult.scraperTest.success
                          ? `Test: ${validationResult.scraperTest.articlesFound} articles found`
                          : "Test: nothing found"}
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
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
                Trust everything
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
                <p className="text-sm text-attention-foreground">
                  Trusted sources take everything from the page — keep the window short.
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => handleAddSource()} 
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
                    Add source
                  </>
                )}
              </Button>
            </div>
            </>)}
          </CardContent>
        </Card>
      )}

      {/* Topic feeds: News and Events shelves of source cards, with one Archived fold */}
      {mode === 'topic' && topicId && (
        <SourceShelves
          topicId={topicId}
          sources={sources}
          loading={loading}
          eventsReloadKey={eventSourcesReload}
          gatheringId={gatheringSource}
          testingId={testingSource}
          onGather={(s) => handleScrapeSource(s as ContentSource, { forceRescrape: true })}
          onArchive={(s) => handleArchiveSource(s as ContentSource)}
          onRestore={(s) => handleReactivateSource(s.id, false)}
          onRemove={(s) => handleDeleteSource(s.id, s.source_name)}
          onSave={(s, v) => handleUpdateSource(s.id, {
            feed_url: v.feed_url,
            scraping_config: { ...(s.scraping_config || {}), trust_content_relevance: v.trust, trusted_max_age_days: v.trustDays },
          })}
          onTest={(s) => handleTestSource(s as ContentSource)}
          onBackfill={(s, days) => handleBackfill(days, s.id)}
        />
      )}

      {/* Sources List (global/region modes) */}
      {mode !== 'topic' && (
      <div className="grid gap-4">
        {sources.filter(s => s.is_active).map((source) => (
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
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{source.canonical_domain}</span>
                    </div>
                  </div>
                </div>


                {/* Right: Metrics + Actions */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                  {/* Trusted badge - only show if set */}
                  {source.scraping_config?.trust_content_relevance && (
                    <Badge variant="outline" className="text-sm">
                      Trusted · {source.scraping_config.trusted_max_age_days || 1}d
                    </Badge>
                  )}



                  {/* Cooldown Status */}
                  <CooldownMinimal
                    lastScrapedAt={source.last_scraped_at}
                    scrapeFrequencyHours={source.scrape_frequency_hours}
                  />

                  {/* Primary Action: Gather Button + Force Rescrape */}
                  {source.is_active ? (
                    <div className="flex items-center gap-1">
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleScrapeSource(source, { forceRescrape: true })}
                        disabled={gatheringSource === source.id || !source.feed_url}
                        title="Force rescrape (bypasses cooldown)"
                        className="flex-shrink-0 px-2"
                      >
                        <RotateCw className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleReactivateSource(source.id, false)}
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
                <div className="mt-3 p-3 bg-destructive/5 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Last Error:</strong> {source.last_error}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {sources.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No sources configured yet. Add your first source above.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Edit a source */}
      <WorkspaceDrawer
        open={!!editingSource}
        onOpenChange={(open) => !open && setEditingSource(null)}
        title={editingSource?.source_name || 'Source'}
        srDescription="Edit this source"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingSource(null)}>Cancel</Button>
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
                  setEditingSource(null);
                  loadSources();
                }
              }}
              disabled={!editingFeedUrl.trim() || loading}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="edit-feed-url" className="text-sm font-medium">Link</Label>
          <Input id="edit-feed-url" value={editingFeedUrl} onChange={(e) => setEditingFeedUrl(e.target.value)} placeholder="https://example.com/feed" />
        </div>
        <div className="flex items-start gap-3">
          <Checkbox id="edit-trust-relevance" checked={editTrustContentRelevance} onCheckedChange={(checked) => setEditTrustContentRelevance(checked as boolean)} />
          <Label htmlFor="edit-trust-relevance" className="flex items-center gap-2 text-base font-normal leading-none">
            Trust everything
            <InfoHint label="About trust everything">Takes everything from the page. Keep the window short.</InfoHint>
          </Label>
        </div>
        {editTrustContentRelevance && (
          <div className="space-y-2">
            <Label htmlFor="edit-max-age" className="text-sm font-medium">How recent</Label>
            <Select value={editTrustedMaxAgeDays.toString()} onValueChange={(value) => setEditTrustedMaxAgeDays(parseInt(value))}>
              <SelectTrigger id="edit-max-age" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="2">Last 48 hours</SelectItem>
                <SelectItem value="3">Last 3 days</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </WorkspaceDrawer>
    </div>
  );
};

/** Compact "12m" style age for the Sources header ("ago" is added beside it on wider screens). */
function formatAgo(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
