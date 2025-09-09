import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Search, Plus, Loader2, CheckCircle, XCircle, AlertTriangle, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SourceSuggestion {
  url: string;
  source_name: string;
  type: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official' | 'WordPress' | 'Substack';
  confidence_score: number;
  rationale: string;
  platform_reliability?: 'high' | 'medium' | 'low';
  technical_validation?: {
    is_accessible: boolean;
    is_valid_rss?: boolean;
    has_recent_content?: boolean;
    estimated_article_count?: number;
  };
}

interface ImprovedSourceSuggestionToolProps {
  topicName: string;
  description: string;
  keywords: string;
  topicType: 'regional' | 'keyword';
  region?: string;
  topicId?: string;
}

export const ImprovedSourceSuggestionTool = ({ 
  topicName, 
  description, 
  keywords, 
  topicType, 
  region,
  topicId 
}: ImprovedSourceSuggestionToolProps) => {
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null);
  const [validationProgress, setValidationProgress] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const getSuggestions = async () => {
    if (!topicName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic name first",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-content-sources', {
        body: {
          topicName,
          description,
          keywords,
          topicType,
          region,
          enhanced: true, // Request enhanced suggestions with platform reliability
          focusPlatforms: ['WordPress', 'RSS', 'Substack', 'News'], // Prioritize reliable platforms
          excludeProblematic: true // Blacklist known problem patterns
        }
      });

      if (error) throw error;

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to get suggestions');
      }

      const suggestions = data?.suggestions || [];
      
      // Filter out unreliable sources and sort by quality
      const filteredSuggestions = suggestions.filter((suggestion: SourceSuggestion) => {
        // Minimum confidence threshold
        if (suggestion.confidence_score < 60) return false;
        
        // Block known problematic patterns
        const url = suggestion.url.toLowerCase();
        const problematicPatterns = [
          'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com',
          'reddit.com', 'pinterest.com', 'linkedin.com',
          'blogspot', 'tumblr', 'medium.com',
          'youtube.com', 'vimeo.com'
        ];
        
        if (problematicPatterns.some(pattern => url.includes(pattern))) return false;
        
        // Prefer high reliability platforms
        if (suggestion.platform_reliability === 'low') return false;
        
        return true;
      });

      const sortedSuggestions = filteredSuggestions.sort((a: SourceSuggestion, b: SourceSuggestion) => {
        const reliabilityScore = (suggestion: SourceSuggestion) => {
          let score = suggestion.confidence_score;
          if (suggestion.platform_reliability === 'high') score += 25;
          if (suggestion.platform_reliability === 'medium') score += 15;
          if (['WordPress', 'RSS', 'Substack', 'News'].includes(suggestion.type)) score += 20;
          return score;
        };
        return reliabilityScore(b) - reliabilityScore(a);
      });

      setSuggestions(sortedSuggestions);
      
      if (sortedSuggestions.length > 0) {
        toast({
          title: "Enhanced Sources Found",
          description: `Found ${sortedSuggestions.length} high-quality sources with technical validation`,
        });

        // Start technical validation for top suggestions
        startTechnicalValidation(sortedSuggestions.slice(0, 5));
      } else {
        toast({
          title: "No Results",
          description: "No reliable sources found. Try adjusting your topic details.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to find sources",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const startTechnicalValidation = async (sourcesToValidate: SourceSuggestion[]) => {
    for (const suggestion of sourcesToValidate) {
      try {
        setValidationProgress(prev => ({ ...prev, [suggestion.url]: 0 }));
        
        // Simulate validation progress
        const progressInterval = setInterval(() => {
          setValidationProgress(prev => {
            const current = prev[suggestion.url] || 0;
            if (current >= 90) {
              clearInterval(progressInterval);
              return prev;
            }
            return { ...prev, [suggestion.url]: current + 10 };
          });
        }, 200);

        const { data: validationResult, error } = await supabase.functions.invoke('validate-content-source', {
          body: {
            url: suggestion.url,
            sourceType: suggestion.type,
            topicType,
            region,
            topicId,
            enhanced: true
          }
        });

        clearInterval(progressInterval);
        setValidationProgress(prev => ({ ...prev, [suggestion.url]: 100 }));

        if (!error && validationResult) {
          // Update suggestion with validation results
          setSuggestions(prev => prev.map(s => 
            s.url === suggestion.url 
              ? {
                  ...s,
                  technical_validation: {
                    is_accessible: validationResult.isAccessible || false,
                    is_valid_rss: validationResult.isValidRSS || false,
                    has_recent_content: validationResult.hasRecentContent || false,
                    estimated_article_count: validationResult.articleCount || 0
                  }
                }
              : s
          ));
        }
      } catch (error) {
        console.error('Validation failed for', suggestion.url, error);
        setValidationProgress(prev => ({ ...prev, [suggestion.url]: -1 })); // -1 indicates error
      }
    }
  };

  const checkExistingSource = async (suggestion: SourceSuggestion): Promise<{exists: boolean, isLinked: boolean, isActive: boolean, id?: string}> => {
    const domain = new URL(suggestion.url).hostname.replace('www.', '');
    
    // First, check if source exists in content_sources by URL or domain
    const { data: existingSource } = await supabase
      .from('content_sources')
      .select('id, source_name, feed_url')
      .or(`feed_url.eq.${suggestion.url},canonical_domain.eq.${domain}`)
      .maybeSingle();

    if (!existingSource) {
      return { exists: false, isLinked: false, isActive: false };
    }

    // Check if this source is linked to the current topic
    const { data: topicSourceLink } = await supabase
      .from('topic_sources')
      .select('is_active')
      .eq('topic_id', topicId)
      .eq('source_id', existingSource.id)
      .maybeSingle();

    return {
      exists: true,
      isLinked: !!topicSourceLink,
      isActive: topicSourceLink?.is_active || false,
      id: existingSource.id
    };
  };

  const addSource = async (suggestion: SourceSuggestion) => {
    const sourceKey = suggestion.url;
    setAddingSourceId(sourceKey);
    
    try {
      const existingCheck = await checkExistingSource(suggestion);
      
      // If source is already linked and active, show error
      if (existingCheck.isLinked && existingCheck.isActive) {
        toast({
          title: "Source Already Added",
          description: "This source is already active for this topic",
          variant: "destructive"
        });
        setAddingSourceId(null);
        return;
      }

      // Enhanced validation using technical validation results
      const validation = suggestion.technical_validation;
      if (validation && !validation.is_accessible) {
        toast({
          title: "Source Not Accessible",
          description: "This source appears to be offline or blocked",
          variant: "destructive"
        });
        setAddingSourceId(null);
        return;
      }

      // Calculate enhanced credibility score
      let credibilityScore = Math.round(suggestion.confidence_score * 0.8);
      
      // Bonus for platform reliability
      if (suggestion.platform_reliability === 'high') credibilityScore += 15;
      if (suggestion.platform_reliability === 'medium') credibilityScore += 10;
      
      // Bonus for technical validation
      if (validation?.is_valid_rss) credibilityScore += 10;
      if (validation?.has_recent_content) credibilityScore += 5;
      if ((validation?.estimated_article_count || 0) > 10) credibilityScore += 5;
      
      credibilityScore = Math.min(95, credibilityScore); // Cap at 95
      
      let sourceId = existingCheck.id;
      
      // If source doesn't exist, create it first
      if (!existingCheck.exists) {
        const domain = new URL(suggestion.url).hostname.replace('www.', '');
        
        const { data: newSource, error: createError } = await supabase
          .from('content_sources')
          .insert({
            source_name: suggestion.source_name,
            feed_url: suggestion.url,
            canonical_domain: domain,
            content_type: 'news',
            credibility_score: credibilityScore,
            is_active: true,
            source_type: suggestion.type === 'RSS' ? 'rss' : 'website',
            region: topicType === 'regional' ? region : null
            // Remove topic_id - we use junction table now
          })
          .select('id')
          .single();

        if (createError) throw createError;
        sourceId = newSource.id;
      }

      // Link source to topic (or reactivate if inactive) - this is critical!
      if (!topicId) {
        throw new Error('Topic ID is required for linking sources');
      }

      const { error: linkError } = await supabase.rpc('add_source_to_topic', {
        p_topic_id: topicId,
        p_source_id: sourceId,
        p_source_config: {}
      });

      if (linkError) {
        console.error('Error linking source to topic:', linkError);
        throw new Error(`Failed to link source: ${linkError.message}`);
      }

      const qualityNote = credibilityScore >= 80 ? 'High Quality' : 
                        credibilityScore >= 70 ? 'Good Quality' : 'Standard';
      
      const actionMessage = existingCheck.isLinked && !existingCheck.isActive ? 
        'reactivated' : 'added';
      
      toast({
        title: "Enhanced Source Added",
        description: `${suggestion.source_name} ${actionMessage} with ${credibilityScore}% credibility (${qualityNote})`,
      });
      
      setSuggestions(suggestions.filter(s => s.url !== suggestion.url));
      window.dispatchEvent(new CustomEvent('sourceAdded'));

    } catch (error) {
      console.error('Error adding source:', error);
      toast({
        title: "Error",
        description: `Failed to add source: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setAddingSourceId(null);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400';
    if (score >= 70) return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400';
    if (score >= 55) return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400';
    return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400';
  };

  const getPlatformReliabilityBadge = (suggestion: SourceSuggestion) => {
    if (!suggestion.platform_reliability) return null;
    
    const config = {
      high: { label: 'Reliable Platform', variant: 'default' as const, className: 'bg-green-100 text-green-800 border-green-300' },
      medium: { label: 'Standard Platform', variant: 'secondary' as const, className: 'bg-blue-100 text-blue-800 border-blue-300' },
      low: { label: 'Basic Platform', variant: 'outline' as const, className: 'bg-yellow-100 text-yellow-800 border-yellow-300' }
    };
    
    const { label, variant, className } = config[suggestion.platform_reliability];
    return <Badge variant={variant} className={className}>{label}</Badge>;
  };

  const getValidationIcon = (url: string) => {
    const progress = validationProgress[url];
    if (progress === undefined) return null;
    if (progress === -1) return <XCircle className="w-4 h-4 text-red-500" />;
    if (progress === 100) return <CheckCircle className="w-4 h-4 text-green-500" />;
    return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Enhanced Source Discovery</h3>
          <p className="text-xs text-muted-foreground">AI-powered source finding with platform reliability scoring</p>
        </div>
        <Button 
          onClick={getSuggestions}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Discover Sources
            </>
          )}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Sources are ranked by platform reliability and technical validation. 
              Higher quality platforms (WordPress, RSS feeds, Substack) are prioritized.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3">
            {suggestions.map((suggestion, index) => {
              const validation = suggestion.technical_validation;
              const progress = validationProgress[suggestion.url];
              
              return (
                <div
                  key={`${suggestion.url}-${index}`}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm truncate">
                        {suggestion.source_name}
                      </h4>
                      <Badge 
                        variant="secondary" 
                        className={`text-xs px-2 ${getConfidenceColor(suggestion.confidence_score)}`}
                      >
                        {suggestion.confidence_score}%
                      </Badge>
                      {getPlatformReliabilityBadge(suggestion)}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {suggestion.type}
                      </Badge>
                      {getValidationIcon(suggestion.url)}
                    </div>

                    <p className="text-xs text-muted-foreground truncate">
                      {suggestion.url}
                    </p>
                    
                    {progress !== undefined && progress >= 0 && progress < 100 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Validating...</p>
                        <Progress value={progress} className="h-1" />
                      </div>
                    )}
                    
                    {validation && (
                      <div className="flex items-center gap-2 text-xs">
                        {validation.is_accessible && <Badge variant="outline" className="text-green-700">✓ Accessible</Badge>}
                        {validation.is_valid_rss && <Badge variant="outline" className="text-blue-700">✓ RSS</Badge>}
                        {validation.has_recent_content && <Badge variant="outline" className="text-purple-700">✓ Fresh Content</Badge>}
                        {(validation.estimated_article_count || 0) > 0 && (
                          <Badge variant="outline" className="text-orange-700">
                            ~{validation.estimated_article_count} articles
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {suggestion.rationale}
                    </p>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => addSource(suggestion)}
                    disabled={addingSourceId === suggestion.url || progress === -1}
                    className="ml-3 h-8 w-8 p-0 hover:bg-primary hover:text-primary-foreground"
                  >
                    {addingSourceId === suggestion.url ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};