import { ArticleData } from './types.ts';

export class DatabaseOperations {
  constructor(private supabase: any) {}

  async storeArticles(
    articles: ArticleData[],
    sourceId: string,
    region: string,
    topicId?: string,
    topicConfig?: any,
    otherRegionalTopics?: any[]
  ): Promise<{ stored: number; duplicates: number; discarded: number }> {
    let stored = 0;
    let duplicates = 0;
    let discarded = 0;

    console.log(`💾 Processing ${articles.length} articles for source ${sourceId}`);

    // Get source information to determine thresholds
    const { data: sourceInfo } = await this.supabase
      .from('content_sources')
      .select('source_type')
      .eq('id', sourceId)
      .single();

    // Set different relevance thresholds based on source type
    let relevanceThreshold = 10;
    if (sourceInfo?.source_type === 'hyperlocal') {
      relevanceThreshold = 5;  // Lower threshold for hyperlocal sources like bournefreelive
    } else if (sourceInfo?.source_type === 'regional') {
      relevanceThreshold = 8;
    } else {
      relevanceThreshold = 15; // Higher threshold for national sources
    }

    for (const article of articles) {
      try {
        // Normalize URL for better comparison
        const normalizedUrl = this.normalizeUrl(article.source_url);
        
        // Check if article already exists with this URL and is not discarded
        const { data: existingArticle } = await this.supabase
          .from('articles')
          .select('id, title, processing_status')
          .eq('source_url', article.source_url)
          .limit(1);

        if (existingArticle && existingArticle.length > 0) {
          const existing = existingArticle[0];
          console.log(`⚠️ Article already exists: ${article.title.substring(0, 50)}... (ID: ${existing.id}, status: ${existing.processing_status})`);
          
          // EMERGENCY: Only count as duplicate if article is not discarded - allow re-processing of discarded articles
          if (existing.processing_status !== 'discarded') {
            // Update URL history to reflect we've seen it again
            await this.supabase
              .from('scraped_urls_history')
              .upsert({
                url: article.source_url,
                topic_id: topicId,
                source_id: sourceId,
                status: 'duplicate',
                last_seen_at: new Date().toISOString()
              }, {
                onConflict: 'url'
              });
              
            duplicates++;
            continue;
          } else {
            console.log(`🔄 Re-processing previously discarded article: ${article.title.substring(0, 50)}...`);
          }
        }

        // Simplified duplicate detection - let the database trigger handle detailed detection
        // Only do basic URL check here for immediate feedback
        console.log(`✨ Article will be processed with automatic duplicate detection: ${article.title.substring(0, 50)}...`);

        // EMERGENCY: Highly permissive filters to allow more content through during recovery
        const minWordCount = sourceInfo?.source_type === 'hyperlocal' ? 10 : 15; // Further reduced
        const minQualityScore = 10; // Significantly reduced 
        
        // More permissive relevance thresholds during emergency recovery
        let recoveryRelevanceThreshold = 5; // Much lower threshold
        if (sourceInfo?.source_type === 'hyperlocal') {
          recoveryRelevanceThreshold = 0;  // Allow everything from hyperlocal sources
        } else if (sourceInfo?.source_type === 'regional') {
          recoveryRelevanceThreshold = 3;
        }
        
        if (article.word_count < minWordCount || article.content_quality_score < minQualityScore || article.regional_relevance_score < recoveryRelevanceThreshold) {
          console.log(`🗑️ Discarded article: ${article.title.substring(0, 50)}... (words: ${article.word_count}/${minWordCount}, quality: ${article.content_quality_score}/${minQualityScore}, relevance: ${article.regional_relevance_score}/${recoveryRelevanceThreshold})`);
          
          // Track URL as discarded
          await this.supabase
            .from('scraped_urls_history')
            .upsert({
              url: article.source_url,
              topic_id: topicId,
              source_id: sourceId,
              status: 'discarded',
              last_seen_at: new Date().toISOString()
            }, {
              onConflict: 'url'
            });
            
          discarded++;
          continue;
        }

        // Prepare article data for insertion
        const articleData = {
          title: article.title,
          body: article.body,
          author: article.author,
          published_at: article.published_at,
          source_url: article.source_url,
          image_url: article.image_url,
          canonical_url: article.canonical_url,
          word_count: article.word_count,
          regional_relevance_score: article.regional_relevance_score,
          content_quality_score: article.content_quality_score,
          processing_status: article.processing_status,
          import_metadata: article.import_metadata,
          region: region,
          source_id: sourceId,
          topic_id: topicId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Insert article
        const { data: insertedArticle, error } = await this.supabase
          .from('articles')
          .insert(articleData)
          .select('id')
          .single();

        if (error) {
          console.error(`❌ Error storing article "${article.title}": ${error.message}`);
          console.error('Error details:', error);
          console.error('Article data summary:', {
            title: articleData.title,
            word_count: articleData.word_count,
            source_url: articleData.source_url,
            source_id: articleData.source_id,
            topic_id: articleData.topic_id
          });
          
          // Log detailed error for debugging
          await this.logSystemEvent(
            'error',
            `Failed to store article: ${error.message}`,
            {
              article_title: article.title,
              source_url: article.source_url,
              source_id: sourceId,
              topic_id: topicId,
              error_code: error.code,
              error_details: error.details
            },
            'database-operations.storeArticles'
          );
          
          continue;
        }

        console.log(`✅ Stored: ${article.title.substring(0, 50)}... (ID: ${insertedArticle.id}, ${article.word_count} words, quality: ${article.content_quality_score})`);
        stored++;

        // ONLY NOW track URL as successfully stored
        await this.supabase
          .from('scraped_urls_history')
          .upsert({
            url: article.source_url,
            topic_id: topicId,
            source_id: sourceId,
            status: 'stored',
            last_seen_at: new Date().toISOString()
          }, {
            onConflict: 'url'
          });

      } catch (error) {
        console.error(`❌ Exception processing article "${article.title}": ${error.message}`);
        console.error('Exception details:', error);
        
        // Log system error for monitoring
        await this.logSystemEvent(
          'error',
          `Exception processing article: ${error.message}`,
          {
            article_title: article.title,
            source_url: article.source_url,
            source_id: sourceId,
            topic_id: topicId,
            stack: error.stack
          },
          'database-operations.storeArticles'
        );
        
        continue;
      }
    }

    console.log(`📊 Storage summary - Stored: ${stored}, Duplicates: ${duplicates}, Discarded: ${discarded}`);
    return { stored, duplicates, discarded };
  }

  async updateSourceMetrics(
    sourceId: string,
    success: boolean,
    method: string,
    responseTime: number
  ): Promise<void> {
    try {
      // Get current metrics
      const { data: source } = await this.supabase
        .from('content_sources')
        .select('articles_scraped, success_rate, avg_response_time_ms')
        .eq('id', sourceId)
        .single();

      if (source) {
        const totalScrapes = (source.articles_scraped || 0) + 1;
        const currentSuccessRate = source.success_rate || 100;
        const newSuccessRate = success 
          ? ((currentSuccessRate * (totalScrapes - 1)) + 100) / totalScrapes
          : ((currentSuccessRate * (totalScrapes - 1)) + 0) / totalScrapes;

        const currentAvgResponseTime = source.avg_response_time_ms || 0;
        const newAvgResponseTime = ((currentAvgResponseTime * (totalScrapes - 1)) + responseTime) / totalScrapes;

        await this.supabase
          .from('content_sources')
          .update({
            articles_scraped: totalScrapes,
            success_rate: Math.round(newSuccessRate * 100) / 100,
            avg_response_time_ms: Math.round(newAvgResponseTime),
            last_scraped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            scraping_method: method
          })
          .eq('id', sourceId);

        console.log(`📈 Updated source metrics: ${totalScrapes} scrapes, ${Math.round(newSuccessRate)}% success rate`);
      }
    } catch (error) {
      console.error(`❌ Error updating source metrics: ${error.message}`);
    }
  }

  async markArticleAsManuallyDiscarded(articleId: string): Promise<void> {
    try {
      // Get the article's source URL
      const { data: article } = await this.supabase
        .from('articles')
        .select('source_url')
        .eq('id', articleId)
        .single();

      if (article) {
        // Update URL history status to 'manually_discarded'
        await this.supabase
          .from('scraped_urls_history')
          .update({ 
            status: 'manually_discarded',
            last_seen_at: new Date().toISOString()
          })
          .eq('url', article.source_url);

        console.log(`🚫 Marked article as manually discarded: ${article.source_url}`);
      }
    } catch (error) {
      console.error(`❌ Error marking article as manually discarded: ${error.message}`);
    }
  }

  async logSystemEvent(
    level: 'info' | 'warn' | 'error',
    message: string,
    context: Record<string, any> = {},
    functionName?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('system_logs')
        .insert({
          level,
          message,
          context,
          function_name: functionName,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error(`❌ Error logging system event: ${error.message}`);
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove trailing slashes and normalize query parameters
      return urlObj.href.replace(/\/$/, '').toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    // Normalize titles by removing punctuation and extra whitespace
    const normalize = (str: string) => str
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    const norm1 = normalize(title1);
    const norm2 = normalize(title2);
    
    if (norm1 === norm2) return 1.0;
    if (norm1.length === 0 || norm2.length === 0) return 0.0;
    
    return this.calculateSimilarity(norm1, norm2);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // NEW: Helper method to extract domain from URL
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  // Recovery method to reset orphaned URLs that were marked as scraped but have no articles
  async recoverOrphanedUrls(sourceId?: string, topicId?: string): Promise<number> {
    try {
      console.log('🔄 Starting recovery of orphaned URLs...');
      
      let query = this.supabase
        .from('scraped_urls_history')
        .select('url, id')
        .eq('status', 'scraped');
      
      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }
      
      if (topicId) {
        query = query.eq('topic_id', topicId);
      }
      
      const { data: scrapedUrls } = await query;
      
      if (!scrapedUrls || scrapedUrls.length === 0) {
        console.log('✅ No orphaned URLs found');
        return 0;
      }
      
      let recovered = 0;
      
      for (const urlRecord of scrapedUrls) {
        // Check if article exists for this URL
        const { data: articleExists } = await this.supabase
          .from('articles')
          .select('id')
          .eq('source_url', urlRecord.url)
          .limit(1);
        
        if (!articleExists || articleExists.length === 0) {
          // No article exists, reset this URL for retry
          await this.supabase
            .from('scraped_urls_history')
            .delete()
            .eq('id', urlRecord.id);
          
          console.log(`🔄 Reset orphaned URL: ${urlRecord.url}`);
          recovered++;
        }
      }
      
      console.log(`✅ Recovery complete: ${recovered} URLs reset for retry`);
      
      // Log recovery action
      await this.logSystemEvent(
        'info',
        `Recovered ${recovered} orphaned URLs`,
        {
          source_id: sourceId,
          topic_id: topicId,
          recovered_count: recovered
        },
        'database-operations.recoverOrphanedUrls'
      );
      
      return recovered;
    } catch (error) {
      console.error(`❌ Error during URL recovery: ${error.message}`);
      await this.logSystemEvent(
        'error',
        `Failed to recover orphaned URLs: ${error.message}`,
        { source_id: sourceId, topic_id: topicId },
        'database-operations.recoverOrphanedUrls'
      );
      return 0;
    }
  }
}