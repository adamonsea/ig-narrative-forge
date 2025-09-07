// Topic configuration handler for user-defined regional settings
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export interface TopicWithConfig {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  region?: string;
  keywords: string[];
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  negative_keywords?: string[];
  competing_regions?: string[];
}

export class TopicConfigHandler {
  private supabase: any;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get topic configuration with all related regional topics for competing region detection
   */
  async getTopicWithCompetingRegions(topicId: string): Promise<{
    topic: TopicWithConfig | null;
    competingTopics: TopicWithConfig[];
  }> {
    try {
      // Get the main topic
      const { data: topic, error: topicError } = await this.supabase
        .from('topics')
        .select(`
          id, name, topic_type, region, keywords, landmarks, postcodes, 
          organizations, negative_keywords, competing_regions
        `)
        .eq('id', topicId)
        .single();

      if (topicError || !topic) {
        console.error('Error fetching topic:', topicError);
        return { topic: null, competingTopics: [] };
      }

      // Get all other regional topics for competing region detection
      const { data: competingTopics, error: competingError } = await this.supabase
        .from('topics')
        .select(`
          id, name, topic_type, region, keywords, landmarks, postcodes, 
          organizations, negative_keywords, competing_regions
        `)
        .eq('topic_type', 'regional')
        .neq('id', topicId)
        .eq('is_active', true);

      if (competingError) {
        console.error('Error fetching competing topics:', competingError);
      }

      return { 
        topic, 
        competingTopics: competingTopics || [] 
      };

    } catch (error) {
      console.error('Error in getTopicWithCompetingRegions:', error);
      return { topic: null, competingTopics: [] };
    }
  }

  /**
   * Convert topic to regional config format for backward compatibility
   */
  topicToRegionalConfig(topic: TopicWithConfig) {
    return {
      region_name: topic.region || topic.name,
      keywords: topic.keywords || [],
      landmarks: topic.landmarks || [],
      postcodes: topic.postcodes || [],
      organizations: topic.organizations || []
    };
  }

  /**
   * Check if content contains any negative keywords
   */
  hasNegativeKeywords(content: string, title: string, negativeKeywords: string[]): boolean {
    if (!negativeKeywords?.length) return false;
    
    const text = `${title} ${content}`.toLowerCase();
    return negativeKeywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
  }

  /**
   * Get all competing regions for penalty calculation
   */
  getCompetingRegionNames(competingTopics: TopicWithConfig[]): string[] {
    return competingTopics
      .filter(topic => topic.region)
      .map(topic => topic.region!)
      .filter(region => region.length > 0);
  }
}