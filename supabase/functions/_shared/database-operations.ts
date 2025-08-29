import { ArticleData } from './types.ts';

export class DatabaseOperations {
  constructor(private supabase: any) {}

  async storeArticles(
    articles: ArticleData[],
    sourceId: string,
    region: string,
    topicId?: string
  ): Promise<{ stored: number; duplicates: number; discarded: number }> {
    let stored = 0;
    let duplicates = 0;
    let discarded = 0;

    console.log(`💾 Storing ${articles.length} articles for source ${sourceId}`);

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
        // Check if URL was previously scraped (even if article was deleted)
        const { data: urlHistory } = await this.supabase
          .from('scraped_urls_history')
          .select('id')
          .eq('url', article.source_url)
          .limit(1);

        if (urlHistory && urlHistory.length > 0) {
          console.log(`⚠️ Previously scraped URL: ${article.title.substring(0, 50)}...`);
          
          // Update last_seen_at for existing URL
          await this.supabase
            .from('scraped_urls_history')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('url', article.source_url);
            
          duplicates++;
          continue;
        }

        // Check for duplicates by title similarity
        const { data: existingArticles } = await this.supabase
          .from('articles')
          .select('id, title')
          .ilike('title', `${article.title.substring(0, 50)}%`);

        if (existingArticles && existingArticles.length > 0) {
          // Check for exact or very similar titles
          const isDuplicate = existingArticles.some((existing: any) => 
            this.calculateSimilarity(existing.title.toLowerCase(), article.title.toLowerCase()) > 0.85
          );

          if (isDuplicate) {
            console.log(`⚠️ Duplicate detected: ${article.title.substring(0, 50)}...`);
            duplicates++;
            continue;
          }
        }

        // Apply quality and relevance filters with dynamic thresholds
        if (article.word_count < 50 || article.content_quality_score < 30 || article.regional_relevance_score < relevanceThreshold) {
          console.log(`🗑️ Discarded article: ${article.title.substring(0, 50)}... (words: ${article.word_count}, quality: ${article.content_quality_score}, relevance: ${article.regional_relevance_score}, threshold: ${relevanceThreshold})`);
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
        const { error } = await this.supabase
          .from('articles')
          .insert(articleData);

        if (error) {
          console.error(`❌ Error storing article: ${error.message}`);
          console.error('Article data:', JSON.stringify(articleData, null, 2));
          continue;
        }

        console.log(`✅ Stored: ${article.title.substring(0, 50)}... (${article.word_count} words, quality: ${article.content_quality_score})`);
        stored++;

        // Track this URL in history to prevent future re-scraping
        try {
          await this.supabase
            .from('scraped_urls_history')
            .insert({
              url: article.source_url,
              topic_id: topicId,
              source_id: sourceId
            });
        } catch (historyError) {
          // Ignore errors (URL might already exist from concurrent operations)
          console.log(`📝 URL history tracking: ${article.source_url}`);
        }

      } catch (error) {
        console.error(`❌ Exception storing article: ${error.message}`);
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
}