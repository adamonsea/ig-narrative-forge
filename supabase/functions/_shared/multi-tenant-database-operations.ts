import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { calculateRegionalRelevance, TopicRegionalConfig } from './region-config.ts'
import { calculateTopicRelevance, TopicConfig } from './hybrid-content-scoring.ts'

export interface ArticleData {
  title: string
  body?: string
  author?: string
  published_at?: string
  source_url: string
  image_url?: string
  canonical_url?: string
  word_count?: number
  language?: string
}

export interface MultiTenantResult {
  success: boolean
  articlesProcessed: number
  articlesScraped: number  // Total articles attempted
  articlesStored: number  // Successfully stored (topicArticlesCreated)
  newContentCreated: number
  topicArticlesCreated: number
  duplicatesSkipped: number
  rejectedLowRelevance: number  // Rejected due to low relevance
  rejectedLowQuality: number  // Rejected due to low quality
  rejectedCompeting: number  // Rejected due to competing region
  errors: string[]
}

export class MultiTenantDatabaseOperations {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Store articles using multi-tenant structure while maintaining backward compatibility
   * Phase 2: STRICT 7-day recency filtering
   */
  async storeArticles(
    articles: ArticleData[],
    topicId: string,
    sourceId?: string,
    maxAgeDays: number = 7,  // Configurable age filter, default 7 days
    sourceConfig?: Record<string, any>  // Source scraping configuration
  ): Promise<MultiTenantResult> {
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const result: MultiTenantResult = {
      success: false,
      articlesProcessed: 0,
      articlesScraped: articles.length,
      articlesStored: 0,
      newContentCreated: 0,
      topicArticlesCreated: 0,
      duplicatesSkipped: 0,
      rejectedLowRelevance: 0,
      rejectedLowQuality: 0,
      rejectedCompeting: 0,
      errors: []
    }
    
    // Check if this is a trusted source (bypass relevance checks)
    const isTrustedSource = sourceConfig?.trust_content_relevance === true
    if (isTrustedSource) {
      console.log(`🔓 TRUSTED SOURCE: Bypassing relevance/quality thresholds for all articles`)
    }

    // Get topic details for filtering
    const { data: topic, error: topicError } = await this.supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single()

    if (topicError || !topic) {
      result.errors.push(`Failed to fetch topic: ${topicError?.message || 'Not found'}`)
      return result
    }

    // Phase 2: Fetch ALL regional topics for competing region detection
    let competingTopics: TopicRegionalConfig[] = []
    if (topic.topic_type === 'regional') {
      const { data: allRegionalTopics } = await this.supabase
        .from('topics')
        .select('id, name, region, competing_regions, keywords, landmarks, postcodes, organizations')
        .eq('topic_type', 'regional')
        .eq('is_active', true)
        .neq('id', topicId)
      
      if (allRegionalTopics) {
        competingTopics = allRegionalTopics.map(t => ({
          keywords: t.keywords || [],
          landmarks: t.landmarks || [],
          postcodes: t.postcodes || [],
          organizations: t.organizations || [],
          competing_regions: t.competing_regions || [],
          region_name: t.region || t.name
        }))
        console.log(`🗺️ Loaded ${competingTopics.length} competing regional topics for boundary detection`)
      }
    }

    // Keyword Topic Profile: Lenient date handling for keyword-based topics
    const isKeywordTopic = topic.topic_type === 'keyword';
    
    // Phase 2: Strict date validation and recency filtering
    console.log(`🗓️ Phase 2: ${isKeywordTopic ? 'Lenient' : 'Strict'} ${maxAgeDays}-day filter - articles must be newer than ${cutoffDate.toISOString()}`)

    const recentArticles = articles.filter(article => {
      if (!article.published_at) {
        if (isKeywordTopic) {
          console.log(`🔑 Keyword topic: Substituting missing date for "${article.title?.substring(0, 50)}..."`);
          article.published_at = now.toISOString();
        } else {
          console.log(`🚫 REJECTED (no date): "${article.title?.substring(0, 50)}..."`)
          return false
        }
      }

      try {
        const pubDate = new Date(article.published_at)
        
        // CRITICAL: Reject future dates (scraping errors)
        if (pubDate > now) {
          console.log(`🚫 REJECTED (future date ${pubDate.toISOString()}): "${article.title?.substring(0, 50)}..."`)
          return false
        }
        
        // CRITICAL: Reject dates before 2020 (likely scraping errors)
        if (pubDate < new Date('2020-01-01')) {
          console.log(`🚫 REJECTED (invalid date ${pubDate.toISOString()}): "${article.title?.substring(0, 50)}..."`)
          return false
        }
        
        // Handle invalid dates
        if (isNaN(pubDate.getTime())) {
          if (isKeywordTopic) {
            console.log(`🔑 Keyword topic: Fixing invalid date for "${article.title?.substring(0, 50)}..."`);
            article.published_at = now.toISOString();
          } else {
            console.log(`🚫 REJECTED (invalid date): "${article.title?.substring(0, 50)}..." - date: "${article.published_at}"`)
            return false
          }
        }

        // Check age limit
        const finalPubDate = new Date(article.published_at);
        const isRecent = finalPubDate >= cutoffDate
        if (!isRecent) {
          const daysOld = Math.floor((now.getTime() - finalPubDate.getTime()) / (1000 * 60 * 60 * 24))
          console.log(`🚫 REJECTED (too old): "${article.title?.substring(0, 50)}..." - ${daysOld} days old`)
        }
        return isRecent
      } catch (error) {
        if (isKeywordTopic) {
          console.log(`🔑 Keyword topic: Fixing date parse error for "${article.title?.substring(0, 50)}..."`);
          article.published_at = now.toISOString();
          return true;
        } else {
          console.log(`🚫 REJECTED (date parse error): "${article.title?.substring(0, 50)}..." - "${article.published_at}"`)
          return false
        }
      }
    })

    console.log(`📅 Phase 2 filtering: ${recentArticles.length}/${articles.length} articles passed ${maxAgeDays}-day recency check`)

    // Phase 3: Filter out suppressed articles
    const allowedArticles = []
    for (const article of recentArticles) {
      const normalizedUrl = this.normalizeUrl(article.source_url)
      
      // Check suppression list
      const { data: suppressedArticle } = await this.supabase
        .from('discarded_articles')
        .select('id')
        .eq('topic_id', topicId)
        .eq('normalized_url', normalizedUrl)
        .single()
      
      if (suppressedArticle) {
        console.log(`🚫 SUPPRESSED: "${article.title?.substring(0, 50)}..." (previously discarded)`)
        continue
      }
      
      allowedArticles.push(article)
    }

    console.log(`🛡️ Phase 3 suppression: ${allowedArticles.length}/${recentArticles.length} articles passed suppression check`)

    for (const article of allowedArticles) {
      try {
        result.articlesProcessed++

        // Get source data for credibility and source type
        const { data: sourceData } = await this.supabase
          .from('content_sources')
          .select('credibility_score, source_type')
          .eq('id', sourceId || '')
          .single()
        
        const credibilityScore = sourceData?.credibility_score || 50
        const sourceType = sourceData?.source_type || 'national'

        // Phase 1: Apply topic-specific filtering with competing region detection
        console.log(`\n🔍 EVALUATING: "${article.title?.substring(0, 60)}..."`)
        console.log(`   URL: ${article.source_url}`)
        
        const relevanceScore = this.calculateRelevanceScore(
          article, 
          topic, 
          competingTopics, 
          sourceType
        )
        const qualityScore = this.calculateQualityScoreWithRelevance(article, topic)
        
        // Keyword Topic Profile: Conservative thresholds (40% reduction from regional)
        const qualityThreshold = credibilityScore >= 90 ? 15 : 30
        const relevanceThreshold = isKeywordTopic ? 2 : (topic.topic_type === 'regional' ? 3 : 5)
        
        console.log(`   📊 Scores: Relevance=${relevanceScore}/${relevanceThreshold}, Quality=${qualityScore}/${qualityThreshold}`)
        console.log(`   📝 Word count: ${this.calculateWordCount(article.body || '')}`)
        console.log(`   🏷️ Topic type: ${topic.topic_type}, Source credibility: ${credibilityScore}%`)
        console.log(`   🔑 Keywords in topic: ${(topic.keywords || []).join(', ')}`)
        
        // Phase 3: Hard rejection filter - reject negative or below threshold scores
        // TRUSTED SOURCE BYPASS: Skip all relevance/quality checks
        if (!isTrustedSource) {
          if (relevanceScore < 0) {
            console.log(`   ❌ REJECTED: Competing region detected (score: ${relevanceScore})`)
            result.rejectedCompeting++
            continue
          }
          
          if (relevanceScore < relevanceThreshold || qualityScore < qualityThreshold) {
            console.log(`   ❌ REJECTED: Below threshold`)
            if (relevanceScore < relevanceThreshold) {
              console.log(`      - Relevance too low: ${relevanceScore} < ${relevanceThreshold}`)
              result.rejectedLowRelevance++
            }
            if (qualityScore < qualityThreshold) {
              console.log(`      - Quality too low: ${qualityScore} < ${qualityThreshold}`)
              result.rejectedLowQuality++
            }
            continue
          }
        } else {
          console.log(`   ✓ TRUSTED SOURCE: Bypassing relevance/quality checks for "${article.title?.substring(0, 60)}..."`)
        }
        
        console.log(`   ✅ PASSED: Article accepted for processing`)
        console.log(`      - Relevance: ${relevanceScore} >= ${relevanceThreshold} ✓`)
        console.log(`      - Quality: ${qualityScore} >= ${qualityThreshold} ✓`)

        // Check for competing topic linkage (prevent cross-contamination)
        const { data: existingLinks } = await this.supabase
          .from('topic_articles')
          .select('topic_id, regional_relevance_score')
          .eq('shared_content_id', article.id || '')
          .neq('topic_id', topicId)
        
        if (existingLinks && existingLinks.length > 0) {
          const hasHigherRelevanceElsewhere = existingLinks.some(
            link => (link.regional_relevance_score || 0) > relevanceScore
          )
          
          if (hasHigherRelevanceElsewhere) {
            console.log(`   🔒 REJECTED: Article already linked to another topic with higher relevance`)
            result.duplicatesSkipped++
            continue
          }
        }

        // Process article in multi-tenant structure
        const processed = await this.processArticleMultiTenant(
          article,
          topic,
          sourceId,
          relevanceScore,
          qualityScore
        )

        if (processed.newContent) result.newContentCreated++
        if (processed.topicArticle) {
          result.topicArticlesCreated++
          result.articlesStored++
        }
        if (processed.skipped) result.duplicatesSkipped++

      } catch (error) {
        console.error('Error processing article:', error)
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Article "${article.title}": ${errorMessage}`)
      }
    }

    result.success = result.errors.length === 0 || result.topicArticlesCreated > 0
    
    console.log(`\n📊 === FILTERING SUMMARY ===`)
    console.log(`   Total articles scraped: ${articles.length}`)
    console.log(`   ✅ Passed recency (${maxAgeDays}d): ${recentArticles.length}`)
    console.log(`   ✅ Passed suppression: ${allowedArticles.length}`)
    console.log(`   ✅ STORED (arrivals): ${result.articlesStored}`)
    console.log(`   ❌ REJECTED - Competing region: ${result.rejectedCompeting}`)
    console.log(`   ❌ REJECTED - Low relevance: ${result.rejectedLowRelevance}`)
    console.log(`   ❌ REJECTED - Low quality: ${result.rejectedLowQuality}`)
    console.log(`   ⏭️  Duplicates skipped: ${result.duplicatesSkipped}`)
    console.log(`   🆕 New shared content: ${result.newContentCreated}`)
    console.log(`   ⚠️ Errors: ${result.errors.length}`)
    
    return result
  }

  /**
   * Process article in new multi-tenant structure
   * Phase 2 Enhancement: Prevent reactivation of discarded articles
   */
  private async processArticleMultiTenant(
    article: ArticleData,
    topic: any,
    sourceId?: string,
    relevanceScore: number = 0,
    qualityScore: number = 0
  ) {
    const normalizedUrl = this.normalizeUrl(article.source_url)
    const sourceDomain = this.extractDomain(article.source_url)

    // Insert or update shared content
    const { data: sharedContent, error: contentError } = await this.supabase
      .from('shared_article_content')
      .upsert({
        url: article.source_url,
        normalized_url: normalizedUrl,
        title: article.title,
        body: article.body || '',
        author: article.author,
        published_at: article.published_at,
        image_url: article.image_url,
        canonical_url: article.canonical_url,
        word_count: article.word_count || this.calculateWordCount(article.body || ''),
        language: article.language || 'en',
        source_domain: sourceDomain,
        last_seen_at: new Date().toISOString()
      }, { 
        onConflict: 'url' // This matches the actual unique constraint
      })
      .select()
      .single()

    if (contentError) {
      throw new Error(`Failed to upsert shared content: ${contentError.message}`)
    }

    // Check if this was new content
    const created = new Date(sharedContent.created_at).getTime()
    const updated = new Date(sharedContent.updated_at).getTime()
    const newContent = Math.abs(created - updated) < 1000

    // Phase 2: Check if topic article already exists and is discarded
    const { data: existingTopicArticle } = await this.supabase
      .from('topic_articles')
      .select('id, processing_status')
      .eq('shared_content_id', sharedContent.id)
      .eq('topic_id', topic.id)
      .single()

    // Phase 2: Skip upsert if article is discarded (permanent delete protection)
    if (existingTopicArticle?.processing_status === 'discarded') {
      console.log(`🛡️ Skipping upsert of discarded article: "${article.title}" (stays deleted)`)
      return {
        newContent,
        topicArticle: false,
        skipped: true,
        sharedContentId: sharedContent.id
      }
    }

    // Insert topic-specific article record (only if not discarded)
    const topicResult = await this.supabase
      .from('topic_articles')
      .upsert({
        shared_content_id: sharedContent.id,
        topic_id: topic.id,
        source_id: sourceId || null, // Ensure proper UUID or null
        regional_relevance_score: relevanceScore,
        content_quality_score: qualityScore,
        keyword_matches: this.findKeywordMatches(article, topic),
        processing_status: existingTopicArticle ? existingTopicArticle.processing_status : 'new', // Preserve existing status
        import_metadata: {
          scrape_method: 'multi_tenant',
          scrape_timestamp: new Date().toISOString(),
          source_domain: sourceDomain
        },
        originality_confidence: 100
      }, {
        onConflict: 'shared_content_id,topic_id' // This matches the actual unique constraint
      })
      .select('id, shared_content_id, topic_id, source_id, processing_status, created_at')
      .single()

    let skipped = false
    const { data: topicArticle, error: topicError } = topicResult
    if (topicError) {
      if (topicError.message.includes('duplicate key') || topicError.message.includes('violates unique constraint')) {
        skipped = true
        console.log(`Topic article already exists: ${article.title}`)
      } else {
        console.error(`Failed to create topic article: ${topicError.message}`)
        // Don't add to result.errors here as result is not in scope
      }
    }

    return {
      newContent,
      topicArticle: !!topicArticle,
      skipped,
      sharedContentId: sharedContent.id
    }
  }

  /**
   * Get articles for a topic using multi-tenant structure
   */
  async getTopicArticles(
    topicId: string,
    status?: string,
    limit: number = 50,
    offset: number = 0
  ) {
    const { data, error } = await this.supabase.rpc('get_topic_articles_multi_tenant', {
      p_topic_id: topicId,
      p_status: status,
      p_limit: limit,
      p_offset: offset
    })

    if (error) {
      throw new Error(`Failed to fetch topic articles: ${error.message}`)
    }

    return data || []
  }

  /**
   * Check if article content already exists
   */
  async checkContentExists(url: string): Promise<{ exists: boolean; contentId?: string }> {
    const normalizedUrl = this.normalizeUrl(url)
    
    const { data, error } = await this.supabase
      .from('shared_article_content')
      .select('id')
      .eq('normalized_url', normalizedUrl)
      .single()

    if (error && !error.message.includes('No rows')) {
      throw new Error(`Failed to check content existence: ${error.message}`)
    }

    return {
      exists: !!data,
      contentId: data?.id
    }
  }

  /**
   * Calculate relevance score based on topic configuration
   * Uses unified hybrid scoring system from hybrid-content-scoring.ts
   * Supports sophisticated keyword matching with variations and context awareness
   */
  private calculateRelevanceScore(
    article: ArticleData, 
    topic: any, 
    competingTopics: TopicRegionalConfig[] = [],
    sourceType: string = 'national'
  ): number {
    const title = article.title || ''
    const body = article.body || ''
    const keywords = topic.keywords || []
    const negativeKeywords = topic.negative_keywords || []
    
    // Check negative keywords first (disqualifying)
    for (const negKeyword of negativeKeywords) {
      const negKeywordLower = negKeyword.toLowerCase()
      if (title.toLowerCase().includes(negKeywordLower) || body.toLowerCase().includes(negKeywordLower)) {
        console.log(`❌ Negative keyword "${negKeyword}" found - disqualifying article`)
        return -100 // Strong negative signal
      }
    }
    
    // Build TopicConfig for unified scoring
    const topicConfig: TopicConfig = {
      id: topic.id,
      topic_type: topic.topic_type,
      keywords: keywords,
      negative_keywords: negativeKeywords,
      region: topic.region,
      landmarks: topic.landmarks || [],
      postcodes: topic.postcodes || [],
      organizations: topic.organizations || [],
      competing_regions: topic.competing_regions || []
    }
    
    // Log topic type for debugging
    if (topic.topic_type === 'regional') {
      console.log(`      🗺️ Regional topic: "${topic.region || topic.name}"`)
      console.log(`      🔍 Checking keywords: ${keywords.join(', ')}`)
      console.log(`      📍 Landmarks: ${topicConfig.landmarks?.join(', ') || 'none'}`)
      console.log(`      📮 Postcodes: ${topicConfig.postcodes?.join(', ') || 'none'}`)
    } else {
      console.log(`      🔑 Keyword topic: "${topic.name}"`)
      console.log(`      🔍 Checking ${keywords.length} keywords with sophisticated matching`)
    }
    
    // Use unified hybrid scoring system for ALL topics (regional and keyword)
    const scoreResult = calculateTopicRelevance(
      body,
      title,
      topicConfig,
      sourceType,
      competingTopics,
      article.source_url
    )
    
    // Enhanced logging with keyword match details
    if (scoreResult.method === 'keyword' && scoreResult.details.keyword_matches) {
      const matches = scoreResult.details.keyword_matches
      if (matches.length > 0) {
        console.log(`      ✅ Matched keywords: ${matches.map(m => `"${m.keyword}" (${m.count}x)`).join(', ')}`)
      } else {
        console.log(`      ❌ No keyword matches found`)
      }
    }
    
    console.log(`      📊 ${scoreResult.method === 'regional' ? 'Regional' : 'Keyword'} relevance score: ${scoreResult.relevance_score}`)
    
    return scoreResult.relevance_score
  }

  /**
   * Calculate content quality score
   */
  private calculateQualityScore(article: ArticleData): number {
    let score = 50 // Base score
    
    const title = article.title || ''
    const body = article.body || ''
    const wordCount = article.word_count || this.calculateWordCount(body)
    
    // Smart word count scoring
    if (wordCount > 300) score += 20
    else if (wordCount > 150) score += 15
    else if (wordCount > 100) score += 10
    else if (wordCount > 50) score += 5
    else if (wordCount < 30) score -= 10 // Reduced penalty from -30
    
    // Content quality indicators (reduced importance)
    if (article.author) score += 5 // Reduced from 10
    if (article.published_at) score += 3 // Reduced from 5
    // Removed image scoring as it's not important
    
    // Negative quality indicators
    if (title.toLowerCase().includes('error') || title.toLowerCase().includes('404')) score -= 50
    if (body.length > 0 && body.length < title.length * 2) score -= 15 // Reduced penalty
    
    return Math.min(100, Math.max(0, score))
  }

  private calculateQualityScoreWithRelevance(article: ArticleData, topic: any): number {
    let score = this.calculateQualityScore(article)
    
    const title = (article.title || '').toLowerCase()
    const body = (article.body || '').toLowerCase()
    const keywords = topic.keywords || []
    
    // Keyword relevance boost for title
    for (const keyword of keywords) {
      if (title.includes(keyword.toLowerCase())) {
        score += 15 // Big boost for keyword in title
      }
    }
    
    // Regional relevance boost
    if (topic.topic_type === 'regional' && topic.region) {
      const region = topic.region.toLowerCase()
      if (title.includes(region)) score += 20 // Big boost for region in title
      
      // Check landmarks and postcodes
      const landmarks = topic.landmarks || []
      const postcodes = topic.postcodes || []
      const organizations = topic.organizations || []
      
      const allLocationItems = landmarks.concat(postcodes).concat(organizations)
      for (const item of allLocationItems) {
        if (title.includes(item.toLowerCase())) {
          score += 15
        }
      }
    }
    
    return Math.min(100, Math.max(0, score))
  }

  /**
   * Find keyword matches in article content
   */
  private findKeywordMatches(article: ArticleData, topic: any): string[] {
    const matches: string[] = []
    const title = (article.title || '').toLowerCase()
    const body = (article.body || '').toLowerCase()
    const keywords = topic.keywords || []
    
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase()
      if (title.includes(keywordLower) || body.includes(keywordLower)) {
        matches.push(keyword)
      }
    }
    
    return matches
  }

  private normalizeUrl(url: string): string {
    try {
      let normalized = url.toLowerCase().trim()
      normalized = normalized.replace(/^https?:\/\//, '')
      normalized = normalized.replace(/^www\./, '')
      normalized = normalized.replace(/\/$/, '')
      normalized = normalized.replace(/[?&](utm_[^&]*|fbclid=[^&]*|gclid=[^&]*)/g, '')
      normalized = normalized.replace(/[?&]$/, '')
      return normalized
    } catch {
      return url
    }
  }

  private extractDomain(url: string): string {
    try {
      const match = url.match(/^https?:\/\/([^\/]+)/)
      return match ? match[1].replace(/^www\./, '') : ''
    } catch {
      return ''
    }
  }

  private calculateWordCount(text: string): number {
    if (!text) return 0
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }
}