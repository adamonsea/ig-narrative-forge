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
        // Phase 4: Use enhanced URL normalization
        const normalizedUrl = await this.enhancedNormalizeUrl(article.source_url);
        
        // Phase 2: CRITICAL FIX - Check discarded articles table first
        if (topicId) {
          const { data: discardedCheck } = await this.supabase
            .from('discarded_articles')
            .select('id, discarded_reason')
            .eq('topic_id', topicId)
            .eq('normalized_url', normalizedUrl)
            .limit(1);

          if (discardedCheck && discardedCheck.length > 0) {
            console.log(`🚫 Article was previously discarded for this topic: ${article.title.substring(0, 50)}... (reason: ${discardedCheck[0].discarded_reason})`);
            duplicates++;
            continue;
          }
        }
        
        // Check if article already exists with this URL
        const { data: existingArticle } = await this.supabase
          .from('articles')
          .select('id, title, processing_status, topic_id')
          .or(`source_url.eq.${article.source_url},source_url.eq.${normalizedUrl}`)
          .limit(1);

        if (existingArticle && existingArticle.length > 0) {
          const existing = existingArticle[0];
          console.log(`⚠️ Article already exists: ${article.title.substring(0, 50)}... (ID: ${existing.id}, status: ${existing.processing_status})`);
          
          // FIXED: Never allow re-processing of ANY existing article
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
        }

        // Simplified duplicate detection - let the database trigger handle detailed detection
        // Only do basic URL check here for immediate feedback
        console.log(`✨ Article will be processed with automatic duplicate detection: ${article.title.substring(0, 50)}...`);

        // ENHANCED: 150+ word requirement with source-specific thresholds
        let minWordCount = 150; // Base requirement for complete articles
        if (sourceInfo?.source_type === 'hyperlocal') {
          minWordCount = 150; // Hyperlocal: 150 words minimum
        } else if (sourceInfo?.source_type === 'regional') {
          minWordCount = 150; // Regional: 150 words minimum
        } else {
          minWordCount = 200; // National: 200 words minimum
        }
        
        const minQualityScore = 15; // Reasonable quality threshold
        
        // Balanced relevance thresholds
        let relevanceThreshold = 10;
        if (sourceInfo?.source_type === 'hyperlocal') {
          relevanceThreshold = 5;  // Lower for hyperlocal sources
        } else if (sourceInfo?.source_type === 'regional') {
          relevanceThreshold = 8;
        } else {
          relevanceThreshold = 15; // Higher for national sources
        }
        
        // Phase 2: STRICT 7-day filtering in legacy database operations
        let tooOld = false;
        if (article.published_at) {
          try {
            const pubDate = new Date(article.published_at);
            
            // Phase 2: STRICT date validation - no more lenient fallbacks
            if (isNaN(pubDate.getTime())) {
              console.log(`🚫 STRICT REJECT (invalid date): ${article.title.substring(0, 50)}... - date: "${article.published_at}"`);
              discarded++;
              continue;
            }
            
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            tooOld = pubDate < sevenDaysAgo;
            
            if (tooOld) {
              const daysOld = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
              console.log(`🚫 STRICT REJECT (too old): ${article.title.substring(0, 50)}... - ${daysOld} days old`);
            }
          } catch (error) {
            console.log(`🚫 STRICT REJECT (date parse error): ${article.title.substring(0, 50)}... - "${article.published_at}"`);
            discarded++;
            continue;
          }
        } else {
          console.log(`🚫 STRICT REJECT (no published date): ${article.title.substring(0, 50)}...`);
          discarded++;
          continue;
        }

        if (article.word_count < minWordCount || article.content_quality_score < minQualityScore || article.regional_relevance_score < relevanceThreshold || tooOld) {
          console.log(`🗑️ Discarded article: ${article.title.substring(0, 50)}... (words: ${article.word_count}/${minWordCount}, quality: ${article.content_quality_score}/${minQualityScore}, relevance: ${article.regional_relevance_score}/${relevanceThreshold}, too old: ${tooOld})`);
          
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

        // Phase 5: Calculate originality confidence score
        const originalityScore = await this.calculateOriginalityConfidence(article, normalizedUrl, topicId);

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
          originality_confidence: originalityScore,
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`❌ Exception processing article "${article.title}": ${errorMessage}`);
        console.error('Exception details:', error);
        
        // Log system error for monitoring
        await this.logSystemEvent(
          'error',
          `Exception processing article: ${errorMessage}`,
          {
            article_title: article.title,
            source_url: article.source_url,
            source_id: sourceId,
            topic_id: topicId,
            stack: errorStack
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
    responseTime: number,
    articlesStored: number = 0
  ): Promise<void> {
    try {
      // Get current metrics using actual schema columns
      const { data: source } = await this.supabase
        .from('content_sources')
        .select('articles_scraped, success_rate, avg_response_time_ms, consecutive_failures, total_failures, is_active, source_name')
        .eq('id', sourceId)
        .single();

      if (source) {
        const currentConsecutiveFailures = source.consecutive_failures || 0;
        const currentTotalFailures = source.total_failures || 0;
        const newConsecutiveFailures = success ? 0 : currentConsecutiveFailures + 1;
        const newTotalFailures = success ? currentTotalFailures : currentTotalFailures + 1;

        // Calculate rolling success rate using EMA (alpha=0.2)
        const currentSuccessRate = source.success_rate || 100;
        const newSuccessRate = Math.round(currentSuccessRate * 0.8 + (success ? 100 : 0) * 0.2);

        const currentAvgResponseTime = source.avg_response_time_ms || 0;
        const newAvgResponseTime = currentAvgResponseTime > 0
          ? Math.round(currentAvgResponseTime * 0.8 + responseTime * 0.2)
          : responseTime;

        const updateData: Record<string, any> = {
          consecutive_failures: newConsecutiveFailures,
          total_failures: newTotalFailures,
          success_rate: newSuccessRate,
          avg_response_time_ms: Math.round(newAvgResponseTime),
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_successful_method: success ? method : undefined,
          last_method_execution_ms: responseTime
        };

        // Track failure reason
        if (!success) {
          updateData.last_failure_at = new Date().toISOString();
          updateData.last_failure_reason = `Scrape failed at ${new Date().toISOString()}`;
        }

        // Only update articles_scraped if we actually stored articles
        if (articlesStored > 0) {
          const currentArticlesScraped = source.articles_scraped || 0;
          updateData.articles_scraped = currentArticlesScraped + articlesStored;
        }

        // Auto-disable sources after 5+ consecutive failures to save API credits
        const AUTO_DISABLE_THRESHOLD = 5;
        if (newConsecutiveFailures >= AUTO_DISABLE_THRESHOLD && source.is_active) {
          updateData.is_active = false;
          updateData.last_failure_reason = `Auto-disabled: ${newConsecutiveFailures} consecutive failures`;
          console.warn(`🚫 AUTO-DISABLED source "${source.source_name}" (${sourceId}) after ${newConsecutiveFailures} consecutive failures`);
          
          // Log the auto-disable event
          await this.logSystemEvent('warning', `Source auto-disabled after ${newConsecutiveFailures} consecutive failures`, {
            source_id: sourceId,
            source_name: source.source_name,
            consecutive_failures: newConsecutiveFailures,
            total_failures: newTotalFailures,
            success_rate: newSuccessRate
          }, 'source-auto-disable');
        }

        // Remove undefined values
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        await this.supabase
          .from('content_sources')
          .update(updateData)
          .eq('id', sourceId);

        console.log(`📈 Updated source metrics: consecutive_failures=${newConsecutiveFailures}, ${newSuccessRate}% rate${articlesStored > 0 ? `, +${articlesStored} articles` : ''}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error updating source metrics: ${errorMessage}`);
    }
  }

  async markArticleAsManuallyDiscarded(articleId: string): Promise<void> {
    try {
      // Get the article's complete information
      const { data: article } = await this.supabase
        .from('articles')
        .select('source_url, title, topic_id, source_id')
        .eq('id', articleId)
        .single();

      if (article) {
        const normalizedUrl = await this.enhancedNormalizeUrl(article.source_url);
        
        // Phase 1: Add to discarded articles table for permanent tracking
        await this.supabase
          .from('discarded_articles')
          .upsert({
            topic_id: article.topic_id,
            source_id: article.source_id,
            url: article.source_url,
            normalized_url: normalizedUrl,
            title: article.title,
            discarded_reason: 'manually_discarded_by_user',
            discarded_at: new Date().toISOString()
          }, {
            onConflict: 'topic_id,normalized_url'
          });

        // Update URL history status to 'manually_discarded'
        await this.supabase
          .from('scraped_urls_history')
          .update({ 
            status: 'manually_discarded',
            last_seen_at: new Date().toISOString()
          })
          .eq('url', article.source_url);

        // Update article status to discarded
        await this.supabase
          .from('articles')
          .update({
            processing_status: 'discarded',
            import_metadata: {
              discarded_reason: 'manually_discarded_by_user',
              discarded_at: new Date().toISOString()
            }
          })
          .eq('id', articleId);

        console.log(`🚫 Permanently discarded article: ${article.title} (${article.source_url})`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error marking article as manually discarded: ${errorMessage}`);
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error logging system event: ${errorMessage}`);
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

  // Phase 4: Enhanced URL normalization using database function
  private async enhancedNormalizeUrl(url: string): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .rpc('normalize_url_enhanced', { input_url: url });
      
      if (error) {
        console.warn(`Warning: Failed to use enhanced URL normalization: ${error.message}`);
        return this.normalizeUrl(url);
      }
      
      return data || this.normalizeUrl(url);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Enhanced URL normalization error: ${errorMessage}`);
      return this.normalizeUrl(url);
    }
  }

  // Phase 5: Calculate originality confidence score
  private async calculateOriginalityConfidence(article: ArticleData, normalizedUrl: string, topicId?: string): Promise<number> {
    let confidence = 100; // Start with full confidence
    
    try {
      // Check for similar URLs across all topics (not just current one)
      const { data: similarUrls } = await this.supabase
        .from('articles')
        .select('id, source_url, title')
        .neq('processing_status', 'discarded')
        .limit(10);
      
      if (similarUrls) {
        for (const existing of similarUrls) {
          const existingNormalized = await this.enhancedNormalizeUrl(existing.source_url);
          
          // Exact URL match
          if (existingNormalized === normalizedUrl) {
            confidence = Math.min(confidence, 0); // Zero confidence for exact duplicates
            break;
          }
          
          // Domain and path similarity check
          const similarity = this.calculateUrlSimilarity(normalizedUrl, existingNormalized);
          if (similarity > 0.8) {
            confidence = Math.min(confidence, Math.max(20, 100 - similarity * 100));
          }
          
          // Title similarity check
          if (article.title && existing.title) {
            const titleSimilarity = this.calculateTitleSimilarity(article.title, existing.title);
            if (titleSimilarity > 0.85) {
              confidence = Math.min(confidence, Math.max(10, 100 - titleSimilarity * 100));
            }
          }
        }
      }
      
      // Check against discarded articles for this topic
      if (topicId) {
        const { data: discardedSimilar } = await this.supabase
          .from('discarded_articles')
          .select('normalized_url, title')
          .eq('topic_id', topicId)
          .limit(5);
          
        if (discardedSimilar) {
          for (const discarded of discardedSimilar) {
            if (discarded.normalized_url === normalizedUrl) {
              confidence = 0; // Zero confidence if previously discarded
              break;
            }
            
            const similarity = this.calculateUrlSimilarity(normalizedUrl, discarded.normalized_url);
            if (similarity > 0.9) {
              confidence = Math.min(confidence, 5); // Very low confidence
            }
          }
        }
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Error calculating originality confidence: ${errorMessage}`);
    }
    
    return Math.max(0, Math.min(100, confidence));
  }

  // Helper method for URL similarity calculation
  private calculateUrlSimilarity(url1: string, url2: string): number {
    if (url1 === url2) return 1.0;
    
    // Split into domain and path components
    const parts1 = url1.split('/');
    const parts2 = url2.split('/');
    
    // Domain similarity
    const domain1 = parts1[0] || '';
    const domain2 = parts2[0] || '';
    const domainSimilarity = this.calculateSimilarity(domain1, domain2);
    
    // Path similarity
    const path1 = parts1.slice(1).join('/');
    const path2 = parts2.slice(1).join('/');
    const pathSimilarity = this.calculateSimilarity(path1, path2);
    
    // Weighted average (domain more important)
    return (domainSimilarity * 0.7) + (pathSimilarity * 0.3);
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error during URL recovery: ${errorMessage}`);
      await this.logSystemEvent(
        'error',
        `Failed to recover orphaned URLs: ${errorMessage}`,
        { source_id: sourceId, topic_id: topicId },
        'database-operations.recoverOrphanedUrls'
      );
      return 0;
    }
  }
}