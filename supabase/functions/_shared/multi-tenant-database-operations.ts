import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  newContentCreated: number
  topicArticlesCreated: number
  duplicatesSkipped: number
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
    sourceId?: string
  ): Promise<MultiTenantResult> {
    const result: MultiTenantResult = {
      success: false,
      articlesProcessed: 0,
      newContentCreated: 0,
      topicArticlesCreated: 0,
      duplicatesSkipped: 0,
      errors: []
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

    // Phase 2: Pre-filter articles for 7-day recency BEFORE processing
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    console.log(`🗓️ Phase 2: Strict 7-day filter - articles must be newer than ${sevenDaysAgo.toISOString()}`)

    const recentArticles = articles.filter(article => {
      if (!article.published_at) {
        console.log(`🚫 REJECTED (no date): "${article.title?.substring(0, 50)}..."`)
        return false
      }

      try {
        const pubDate = new Date(article.published_at)
        
        // Phase 2: STRICT date validation - no lenient fallbacks
        if (isNaN(pubDate.getTime())) {
          console.log(`🚫 REJECTED (invalid date): "${article.title?.substring(0, 50)}..." - date: "${article.published_at}"`)
          return false
        }

        const isRecent = pubDate >= sevenDaysAgo
        if (!isRecent) {
          const daysOld = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24))
          console.log(`🚫 REJECTED (too old): "${article.title?.substring(0, 50)}..." - ${daysOld} days old`)
        }
        return isRecent
      } catch (error) {
        console.log(`🚫 REJECTED (date parse error): "${article.title?.substring(0, 50)}..." - "${article.published_at}"`)
        return false
      }
    })

    console.log(`📅 Phase 2 filtering: ${recentArticles.length}/${articles.length} articles passed 7-day recency check`)

    for (const article of recentArticles) {
      try {
        result.articlesProcessed++

        // Apply topic-specific filtering
        const relevanceScore = this.calculateRelevanceScore(article, topic)
        const qualityScore = this.calculateQualityScoreWithRelevance(article, topic)

        // Get source credibility for threshold adjustment
        const { data: sourceData } = await this.supabase
          .from('content_sources')
          .select('credibility_score')
          .eq('id', sourceId || '')
          .single()
        
        const credibilityScore = sourceData?.credibility_score || 50
        const qualityThreshold = credibilityScore >= 90 ? 15 : 30
        const relevanceThreshold = topic.topic_type === 'regional' ? 3 : 5
        
        if (relevanceScore < relevanceThreshold || qualityScore < qualityThreshold) {
          console.log(`🚫 Skipping article: "${article.title}"`)
          console.log(`   - Relevance: ${relevanceScore}/${relevanceThreshold} (${topic.topic_type})`)
          console.log(`   - Quality: ${qualityScore}/${qualityThreshold} (credibility: ${credibilityScore}%)`)
          console.log(`   - Word count: ${this.calculateWordCount(article.body || '')}`)
          continue
        }
        
        console.log(`✅ Article passed filtering: "${article.title}"`)
        console.log(`   - Relevance: ${relevanceScore}, Quality: ${qualityScore}, Words: ${this.calculateWordCount(article.body || '')}`)

        // Process article in multi-tenant structure
        const processed = await this.processArticleMultiTenant(
          article,
          topic,
          sourceId,
          relevanceScore,
          qualityScore
        )

        if (processed.newContent) result.newContentCreated++
        if (processed.topicArticle) result.topicArticlesCreated++
        if (processed.skipped) result.duplicatesSkipped++

        // Also maintain legacy structure for backward compatibility
        await this.processArticleLegacy(article, topic, sourceId, relevanceScore, qualityScore, processed.sharedContentId)

      } catch (error) {
        console.error('Error processing article:', error)
        result.errors.push(`Article "${article.title}": ${error.message}`)
      }
    }

    result.success = result.errors.length === 0 || result.topicArticlesCreated > 0
    return result
  }

  /**
   * Process article in new multi-tenant structure
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

    // Insert topic-specific article record
    const { error: topicError } = await this.supabase
      .from('topic_articles')
      .upsert({
        shared_content_id: sharedContent.id,
        topic_id: topic.id,
        source_id: sourceId || null, // Ensure proper UUID or null
        regional_relevance_score: relevanceScore,
        content_quality_score: qualityScore,
        keyword_matches: this.findKeywordMatches(article, topic),
        processing_status: 'new',
        import_metadata: {
          scrape_method: 'multi_tenant',
          scrape_timestamp: new Date().toISOString(),
          source_domain: sourceDomain
        },
        originality_confidence: 100
      }, {
        onConflict: 'shared_content_id,topic_id' // This matches the actual unique constraint
      })
      .select()

    let skipped = false
    let topicArticle = null
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
   * Maintain legacy structure for backward compatibility
   */
  private async processArticleLegacy(
    article: ArticleData,
    topic: any,
    sourceId?: string,
    relevanceScore: number = 0,
    qualityScore: number = 0,
    sharedContentId?: string
  ) {
    try {
      // Only insert if sourceId is a valid UUID or null
      const validSourceId = sourceId && sourceId.length === 36 ? sourceId : null;
      
      await this.supabase
        .from('articles')
        .insert({
          topic_id: topic.id,
          source_id: validSourceId,
          title: article.title,
          body: article.body || '',
          author: article.author,
          source_url: article.source_url,
          image_url: article.image_url,
          canonical_url: article.canonical_url,
          published_at: article.published_at,
          word_count: article.word_count || this.calculateWordCount(article.body || ''),
          regional_relevance_score: relevanceScore,
          content_quality_score: qualityScore,
          processing_status: 'new',
          language: article.language || 'en',
          import_metadata: {
            multi_tenant_migration: true,
            shared_content_id: sharedContentId,
            scrape_method: 'multi_tenant_compatible'
          }
        })
    } catch (error) {
      // Legacy errors are expected during migration, don't fail the whole process
      console.log('Legacy article insert warning:', error.message)
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
   */
  private calculateRelevanceScore(article: ArticleData, topic: any): number {
    let score = 0
    const title = (article.title || '').toLowerCase()
    const body = (article.body || '').toLowerCase()
    const keywords = topic.keywords || []
    const negativeKeywords = topic.negative_keywords || []
    
    // Check negative keywords first (disqualifying)
    for (const negKeyword of negativeKeywords) {
      if (title.includes(negKeyword.toLowerCase()) || body.includes(negKeyword.toLowerCase())) {
        return 0 // Disqualified
      }
    }
    
    // Check positive keywords
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase()
      if (title.includes(keywordLower)) score += 20
      if (body.includes(keywordLower)) score += 10
    }
    
    // Regional relevance for regional topics
    if (topic.topic_type === 'regional' && topic.region) {
      const region = topic.region.toLowerCase()
      if (title.includes(region)) score += 30
      if (body.includes(region)) score += 15
      
      // Check landmarks, postcodes, organizations
      const landmarks = topic.landmarks || []
      const postcodes = topic.postcodes || []
      const organizations = topic.organizations || []
      
      const allLocationItems = landmarks.concat(postcodes).concat(organizations)
      allLocationItems.forEach(item => {
        if (title.includes(item.toLowerCase()) || body.includes(item.toLowerCase())) {
          score += 25
        }
      })
    }
    
    return Math.min(100, Math.max(0, score))
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