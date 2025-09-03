import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Globe, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { getScraperFunction, createScraperRequestBody } from '@/lib/scraperUtils';

interface ScrapingRule {
  id: string;
  topic_id: string;
  source_url: string;
  is_active: boolean;
  scrape_frequency_hours: number;
  last_scraped_at: string | null;
  next_scrape_at: string | null;
  success_count: number;
  failure_count: number;
  last_error: string | null;
  created_at: string;
  is_scraping?: boolean; // For UI state tracking
}

interface ScrapingAutomationManagerProps {
  topicId: string;
  topicName: string;
  topicType?: 'regional' | 'keyword';
  region?: string;
}

export const ScrapingAutomationManager = ({ topicId, topicName, topicType = 'keyword', region }: ScrapingAutomationManagerProps) => {
  const [rules, setRules] = useState<ScrapingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newFrequency, setNewFrequency] = useState('12');
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    loadScrapingRules();
  }, [topicId]);

  const loadScrapingRules = async () => {
    try {
      const { data, error } = await supabase
        .from('scraping_automation')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRules(data || []);
    } catch (error: any) {
      console.error('Error loading scraping rules:', error);
      toast({
        title: "Error",
        description: "Failed to load scraping automation rules",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addScrapingRule = async () => {
    if (!newSourceUrl.trim()) return;

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to add scraping rules",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('scraping_automation')
        .insert({
          topic_id: topicId,
          source_url: newSourceUrl.trim(),
          scrape_frequency_hours: parseInt(newFrequency),
          is_active: true
        });

      if (error) throw error;

      setNewSourceUrl('');
      setNewFrequency('12');
      await loadScrapingRules();

      toast({
        title: "Success",
        description: "Scraping rule added successfully"
      });
    } catch (error: any) {
      console.error('Error adding scraping rule:', error);
      const errorMessage = error.message?.includes('row-level security') 
        ? "Permission denied. Please ensure you're logged in and have access to this topic."
        : "Failed to add scraping rule";
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const updateRule = async (ruleId: string, updates: Partial<ScrapingRule>) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to update scraping rules",
        variant: "destructive"
      });
      return;
    }

    try {
      // For updates, use UPDATE instead of UPSERT since we know the record exists
      const { error } = await supabase
        .from('scraping_automation')
        .update({
          is_active: updates.is_active,
          scrape_frequency_hours: updates.scrape_frequency_hours,
          last_scraped_at: updates.last_scraped_at,
          success_count: updates.success_count,
          failure_count: updates.failure_count,
          last_error: updates.last_error
        })
        .eq('id', ruleId);

      if (error) throw error;

      await loadScrapingRules();
      
      toast({
        title: "Success",
        description: "Scraping rule updated successfully"
      });
    } catch (error: any) {
      console.error('Error updating scraping rule:', error);
      const errorMessage = error.message?.includes('row-level security') 
        ? "Permission denied. Please ensure you're logged in and have access to this topic."
        : "Failed to update scraping rule";
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('scraping_automation')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;

      await loadScrapingRules();
      
      toast({
        title: "Success",
        description: "Scraping rule deleted successfully"
      });
    } catch (error: any) {
      console.error('Error deleting scraping rule:', error);
      toast({
        title: "Error",
        description: "Failed to delete scraping rule",
        variant: "destructive"
      });
    }
  };

  const triggerManualScrape = async (rule: ScrapingRule) => {
    const [scrapingRule] = rules.filter(r => r.id === rule.id);
    
    // Update UI to show scraping in progress
    setRules(prev => prev.map(r => 
      r.id === rule.id 
        ? { ...r, last_error: null, is_scraping: true } 
        : r
    ));

    try {
      // First, get or create a content source for this URL
      let sourceId = null;
      try {
        // Try to find existing source
        const { data: existingSource, error: sourceError } = await supabase
          .from('content_sources')
          .select('id')
          .eq('feed_url', rule.source_url)
          .single();

        if (sourceError && sourceError.code !== 'PGRST116') {
          throw sourceError;
        }

        if (existingSource) {
          sourceId = existingSource.id;
        } else {
          // Create new source
          const domain = new URL(rule.source_url).hostname;
          const { data: newSource, error: createError } = await supabase
            .from('content_sources')
            .insert({
              source_name: domain,
              feed_url: rule.source_url,
              canonical_domain: domain,
              source_type: 'regional',
              is_active: true
            })
            .select('id')
            .single();

          if (createError) throw createError;
          sourceId = newSource.id;
        }
      } catch (sourceErr) {
        console.error('Error managing source:', sourceErr);
        throw new Error('Failed to setup content source');
      }

      const scraperFunction = getScraperFunction(topicType);
      const requestBody = createScraperRequestBody(
        topicType,
        rule.source_url,
        { topicId, sourceId, region }
      );

      const { data, error } = await supabase.functions.invoke(scraperFunction, {
        body: requestBody
      });

      if (error) throw error;

      // Update the rule with success info
      await updateRule(rule.id, {
        last_scraped_at: new Date().toISOString(),
        success_count: rule.success_count + 1,
        last_error: null
      });

      // Show detailed scraping results toast
      const articlesFound = data?.articlesFound || 0;
      const articlesStored = data?.articlesStored || 0;
      const duplicatesDetected = data?.duplicatesDetected || 0;
      const articlesDiscarded = data?.articlesDiscarded || 0;

      toast({
        title: "Scraping Completed",
        description: `Found ${articlesFound} articles, stored ${articlesStored}, found ${duplicatesDetected} duplicates, disqualified ${articlesDiscarded} from ${new URL(rule.source_url).hostname}`
      });
    } catch (error: any) {
      console.error('Error triggering manual scrape:', error);
      
      // Update rule with error info
      await updateRule(rule.id, {
        failure_count: rule.failure_count + 1,
        last_error: error.message.substring(0, 500) // Truncate long errors
      });

      toast({
        title: "Scraping Failed",
        description: `Could not scrape from ${new URL(rule.source_url).hostname}. Check the URL and try again.`,
        variant: "destructive"
      });
    } finally {
      // Remove scraping indicator
      setRules(prev => prev.map(r => 
        r.id === rule.id 
          ? { ...r, is_scraping: false } 
          : r
      ));
    }
  };

  const getStatusBadge = (rule: ScrapingRule) => {
    if (!rule.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    
    const successRate = rule.success_count + rule.failure_count > 0 
      ? (rule.success_count / (rule.success_count + rule.failure_count) * 100)
      : 0;
      
    if (rule.last_error) {
      return <Badge variant="destructive">Failed</Badge>;
    } else if (successRate >= 80) {
      return <Badge variant="default">Healthy</Badge>;
    } else if (successRate >= 50) {
      return <Badge variant="secondary">Warning</Badge>;
    } else {
      return <Badge variant="destructive">Poor</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add New Rule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Scraping Source
          </CardTitle>
          <CardDescription>
            Add RSS feeds or websites to automatically scrape for {topicName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/rss or https://example.com"
              value={newSourceUrl}
              onChange={(e) => setNewSourceUrl(e.target.value)}
              className="flex-1"
            />
            <Select value={newFrequency} onValueChange={setNewFrequency}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every hour</SelectItem>
                <SelectItem value="6">Every 6 hours</SelectItem>
                <SelectItem value="12">Twice daily</SelectItem>
                <SelectItem value="24">Daily</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addScrapingRule} disabled={saving || !newSourceUrl.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Rules */}
      <div className="space-y-4">
        {rules.map((rule) => (
          <Card key={rule.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium truncate max-w-sm">{rule.source_url}</p>
                    <p className="text-sm text-muted-foreground">
                      Every {rule.scrape_frequency_hours} hour{rule.scrape_frequency_hours !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(rule)}
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) => updateRule(rule.id, { is_active: checked })}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{rule.success_count} success</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span>{rule.failure_count} failed</span>
                  </div>
                  {rule.last_scraped_at && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>Last: {new Date(rule.last_scraped_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerManualScrape(rule)}
                    disabled={rule.is_scraping}
                    className="min-w-[100px]"
                  >
                    {rule.is_scraping ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        Scraping...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Gather Now
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteRule(rule.id)}
                    disabled={rule.is_scraping}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {rule.last_error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">Last Error: {rule.last_error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        
        {rules.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <Globe className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Scraping Rules</h3>
              <p className="text-muted-foreground">
                Add RSS feeds or websites to automatically monitor for new content about {topicName}.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
