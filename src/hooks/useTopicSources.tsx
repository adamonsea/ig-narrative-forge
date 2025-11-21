import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TopicSource {
  source_id: string;
  source_name: string;
  canonical_domain: string;
  feed_url: string;
  is_active: boolean;
  credibility_score: number;
  articles_scraped: number;
  last_scraped_at: string | null;
  source_config: any;
}

interface ContentSource {
  id: string;
  source_name: string;
  feed_url: string;
  canonical_domain: string;
  credibility_score: number;
  is_active: boolean;
}

export const useTopicSources = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  /**
   * Get all sources for a specific topic
   */
  const getTopicSources = async (topicId: string): Promise<TopicSource[]> => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_topic_sources', {
        p_topic_id: topicId
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting topic sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load topic sources',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get all topics that a source is linked to
   */
  const getSourceTopics = async (sourceId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_source_topics', {
        p_source_id: sourceId
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting source topics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load source topics',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add an existing source to a topic
   */
  const addSourceToTopic = async (
    topicId: string, 
    sourceId: string, 
    config: any = {}
  ): Promise<boolean> => {
    try {
      setLoading(true);
      
      // Update the source to set topic_id if not already set
      // Removed legacy direct topic_id update on content_sources; we use the topic_sources junction table exclusively
      // This prevents unique constraint conflicts on (source_name, topic_id)

      
      // Link source to topic via junction table
      const { error } = await supabase.rpc('add_source_to_topic', {
        p_topic_id: topicId,
        p_source_id: sourceId,
        p_source_config: {
          ...config,
          added_via: 'useTopicSources_hook',
          added_at: new Date().toISOString()
        }
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Source linked to topic successfully - starting content gathering',
      });
      
      return true;
    } catch (error) {
      console.error('Error adding source to topic:', error);
      toast({
        title: 'Error',
        description: 'Failed to link source to topic',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reactivate a source and trigger test scrape
   */
  const reactivateAndTestSource = async (
    sourceId: string,
    topicId: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      
      // Reactivate the source
      const { error: updateError } = await supabase
        .from('content_sources')
        .update({ 
          is_active: true, 
          consecutive_failures: 0,
          updated_at: new Date().toISOString() 
        })
        .eq('id', sourceId);

      if (updateError) throw updateError;

      // Trigger test scrape
      const { data, error: scrapeError } = await supabase.functions.invoke('universal-topic-scraper', {
        body: {
          topicId,
          sourceId,
          forceRescrape: true
        }
      });

      if (scrapeError) throw scrapeError;

      toast({
        title: 'Source Reactivated',
        description: `Source reactivated and test scrape initiated. Articles found: ${data?.articlesStored || 0}`,
      });
      
      return true;
    } catch (error) {
      console.error('Error reactivating source:', error);
      toast({
        title: 'Error',
        description: 'Failed to reactivate and test source',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Remove a source from a topic
   */
  const removeSourceFromTopic = async (
    topicId: string, 
    sourceId: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc('remove_source_from_topic', {
        p_topic_id: topicId,
        p_source_id: sourceId
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Source removed from topic successfully',
      });
      
      return true;
    } catch (error) {
      console.error('Error removing source from topic:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove source from topic',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get all available sources that can be added to topics
   */
  const getAvailableSources = async (): Promise<ContentSource[]> => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('content_sources')
        .select('id, source_name, feed_url, canonical_domain, credibility_score, is_active')
        .eq('is_active', true)
        .order('source_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting available sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load available sources',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create a new source and optionally link it to a topic
   */
  const createSourceAndLinkToTopic = async (
    sourceData: {
      source_name: string;
      feed_url: string;
      canonical_domain: string;
      credibility_score?: number;
      content_type?: string;
      region?: string;
    },
    topicId?: string
  ): Promise<{ success: boolean; sourceId?: string }> => {
    try {
      setLoading(true);
      
      // Create the source with topic_id set
      const { data: newSource, error: createError } = await supabase
        .from('content_sources')
        .insert({
          ...sourceData,
          // Do not set topic_id here; link via topic_sources junction to avoid unique constraints
          credibility_score: sourceData.credibility_score || 70,
          content_type: sourceData.content_type || 'news',
          is_active: true,
          is_whitelisted: true,
          is_blacklisted: false
        })
        .select('id')
        .single();

      if (createError) throw createError;

      // Link to topic if specified
      if (topicId && newSource) {
        const linked = await addSourceToTopic(topicId, newSource.id, {
          created_with_topic: true
        });
        
        if (!linked) {
          return { success: false };
        }
      }

      toast({
        title: 'Success',
        description: topicId 
          ? 'Source created and linked to topic - content gathering started'
          : 'Source created successfully - content gathering started',
      });

      return { success: true, sourceId: newSource.id };
    } catch (error) {
      console.error('Error creating source:', error);
      toast({
        title: 'Error',
        description: 'Failed to create source',
        variant: 'destructive',
      });
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    getTopicSources,
    getSourceTopics,
    addSourceToTopic,
    removeSourceFromTopic,
    getAvailableSources,
    createSourceAndLinkToTopic,
    reactivateAndTestSource
  };
};