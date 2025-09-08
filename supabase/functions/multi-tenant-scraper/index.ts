import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ScrapingResult {
  success: boolean
  articlesFound: number
  articlesScraped: number
  newContentCreated: number
  topicArticlesCreated: number
  errors: string[]
  method: 'rss' | 'html' | 'api' | 'fallback'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { feedUrl, topicId, sourceId, articles } = await req.json()

    console.log(`Multi-tenant scraper processing: ${feedUrl} for topic: ${topicId}`)

    let result: ScrapingResult = {
      success: false,
      articlesFound: 0,
      articlesScraped: 0,
      newContentCreated: 0,
      topicArticlesCreated: 0,
      errors: [],
      method: 'api'
    }

    if (!articles || !Array.isArray(articles)) {
      throw new Error('No articles provided')
    }

    result.articlesFound = articles.length

    // Get topic details for filtering
    const { data: topic } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single()

    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`)
    }

    for (const article of articles) {
      try {
        const normalizedUrl = normalizeUrl(article.source_url)
        const sourceDomain = extractDomain(article.source_url)
        
        // Check topic-specific filtering
        const relevanceScore = calculateRelevanceScore(article, topic)
        let qualityScore = calculateQualityScoreWithRelevance(article, topic)
        
        // Try content enhancement for low word count articles
        let enhancedArticle = article
        if (calculateWordCount(article.body || '') < 100) {
          console.log(`🔄 Attempting content enhancement for short article: ${article.title}`)
          try {
            const enhanced = await enhanceContent(article.source_url)
          if (enhanced && enhanced.body && calculateWordCount(enhanced.body) > calculateWordCount(article.body || '')) {
              enhancedArticle = { ...article, ...enhanced }
              qualityScore = calculateQualityScoreWithRelevance(enhancedArticle, topic)
              console.log(`✅ Content enhanced: ${calculateWordCount(article.body || '')} → ${calculateWordCount(enhanced.body)} words`)
            }
          } catch (error) {
            console.log(`⚠️ Content enhancement failed: ${error.message}`)
          }
        }
        
        // Get source credibility for threshold adjustment
        const { data: sourceData } = await supabase
          .from('content_sources')
          .select('credibility_score')
          .eq('id', sourceId)
          .single()
        
        const credibilityScore = sourceData?.credibility_score || 50
        const qualityThreshold = credibilityScore >= 90 ? 15 : 30
        const relevanceThreshold = topic.topic_type === 'regional' ? 3 : 5
        
        // Skip if fails topic filtering with debug info
        if (relevanceScore < relevanceThreshold || qualityScore < qualityThreshold) {
          console.log(`🚫 Skipping article: "${enhancedArticle.title}"`)
          console.log(`   - Relevance: ${relevanceScore}/${relevanceThreshold} (${topic.topic_type})`)
          console.log(`   - Quality: ${qualityScore}/${qualityThreshold} (credibility: ${credibilityScore}%)`)
          console.log(`   - Word count: ${calculateWordCount(enhancedArticle.body || '')}`)
          continue
        }
        
        console.log(`✅ Article passed filtering: "${enhancedArticle.title}"`)
        console.log(`   - Relevance: ${relevanceScore}, Quality: ${qualityScore}, Words: ${calculateWordCount(enhancedArticle.body || '')}`)

        // Insert or update shared content using enhanced article
        const { data: sharedContent, error: contentError } = await supabase
          .from('shared_article_content')
          .upsert({
            url: enhancedArticle.source_url,
            normalized_url: normalizedUrl,
            title: enhancedArticle.title,
            body: enhancedArticle.body || '',
            author: enhancedArticle.author,
            published_at: enhancedArticle.published_at,
            image_url: enhancedArticle.image_url,
            canonical_url: enhancedArticle.canonical_url,
            word_count: calculateWordCount(enhancedArticle.body || ''),
            language: enhancedArticle.language || 'en',
            source_domain: sourceDomain,
            last_seen_at: new Date().toISOString()
          }, { 
            onConflict: 'url',
            ignoreDuplicates: false 
          })
          .select()
          .single()

        if (contentError) {
          console.error('Error upserting shared content:', contentError)
          result.errors.push(`Content error: ${contentError.message}`)
          continue
        }

        let newContentCreated = false
        if (sharedContent) {
          // Check if this was a new record by looking at created_at vs updated_at
          const created = new Date(sharedContent.created_at).getTime()
          const updated = new Date(sharedContent.updated_at).getTime()
          newContentCreated = Math.abs(created - updated) < 1000 // Within 1 second = new
          if (newContentCreated) result.newContentCreated++
        }

        // Insert topic-specific article record
        const { data: topicArticle, error: topicError } = await supabase
          .from('topic_articles')
          .upsert({
            shared_content_id: sharedContent.id,
            topic_id: topicId,
            source_id: sourceId,
            regional_relevance_score: relevanceScore,
            content_quality_score: qualityScore,
            processing_status: 'new',
            import_metadata: {
              scrape_method: 'multi_tenant_scraper',
              scrape_timestamp: new Date().toISOString(),
              source_domain: sourceDomain,
              keyword_matches: findKeywordMatches(enhancedArticle, topic),
              content_enhanced: enhancedArticle !== article,
              quality_breakdown: getQualityScoreBreakdown(enhancedArticle, credibilityScore),
              credibility_score: credibilityScore
            },
            originality_confidence: 100
          }, { 
            onConflict: 'shared_content_id,topic_id',
            ignoreDuplicates: true 
          })
          .select()

        if (topicError && !topicError.message.includes('duplicate key')) {
          console.error('Error creating topic article:', topicError)
          result.errors.push(`Topic article error: ${topicError.message}`)
          continue
        }

        if (topicArticle && topicArticle.length > 0) {
          result.topicArticlesCreated++
        }

        // PARALLEL: Also insert into old articles table for backward compatibility
        try {
          await supabase
            .from('articles')
            .upsert({
              topic_id: topicId,
              source_id: sourceId,
              title: enhancedArticle.title,
              body: enhancedArticle.body,
              author: enhancedArticle.author,
              source_url: enhancedArticle.source_url,
              image_url: enhancedArticle.image_url,
              canonical_url: enhancedArticle.canonical_url,
              published_at: enhancedArticle.published_at,
              word_count: calculateWordCount(enhancedArticle.body || ''),
              regional_relevance_score: relevanceScore,
              content_quality_score: qualityScore,
              processing_status: 'new',
              language: article.language || 'en',
              import_metadata: {
                multi_tenant_migration: true,
                shared_content_id: sharedContent.id,
                scrape_method: 'multi_tenant_scraper'
              }
            }, { 
              onConflict: 'source_url,topic_id',
              ignoreDuplicates: true 
            })
        } catch (legacyError) {
          console.log('Legacy article insert failed (expected during migration):', legacyError)
        }

        result.articlesScraped++

      } catch (articleError) {
        console.error('Error processing article:', articleError)
        result.errors.push(`Article processing error: ${articleError.message}`)
      }
    }

    // Update source metrics
    await supabase
      .from('content_sources')
      .update({
        articles_scraped: result.articlesScraped,
        last_scraped_at: new Date().toISOString()
      })
      .eq('id', sourceId)

    result.success = result.articlesScraped > 0 || result.errors.length === 0

    console.log('Multi-tenant scraper result:', result)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Multi-tenant scraper error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        articlesFound: 0,
        articlesScraped: 0,
        newContentCreated: 0,
        topicArticlesCreated: 0,
        errors: [error.message]
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function normalizeUrl(url: string): string {
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

function extractDomain(url: string): string {
  try {
    const match = url.match(/^https?:\/\/([^\/]+)/)
    return match ? match[1].replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

function calculateWordCount(text: string): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(word => word.length > 0).length
}

function calculateRelevanceScore(article: any, topic: any): number {
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
    
    // Check landmarks and postcodes
    const landmarks = topic.landmarks || []
    const postcodes = topic.postcodes || []
    
    for (const landmark of landmarks) {
      if (title.includes(landmark.toLowerCase()) || body.includes(landmark.toLowerCase())) {
        score += 25
      }
    }
    
    for (const postcode of postcodes) {
      if (title.includes(postcode.toLowerCase()) || body.includes(postcode.toLowerCase())) {
        score += 20
      }
    }
  }
  
  return Math.min(100, Math.max(0, score))
}

function calculateQualityScore(article: any): number {
  let score = 50 // Base score
  
  const title = article.title || ''
  const body = article.body || ''
  const wordCount = calculateWordCount(body)
  
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

function calculateQualityScoreWithRelevance(article: any, topic: any): number {
  let score = calculateQualityScore(article)
  
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

function getQualityScoreBreakdown(article: any, credibilityScore: number = 50): any {
  const title = article.title || ''
  const body = article.body || ''
  const wordCount = calculateWordCount(body)
  
  return {
    base_score: 50,
    word_count: wordCount,
    word_count_bonus: wordCount > 300 ? 20 : wordCount > 150 ? 15 : wordCount > 100 ? 10 : wordCount > 50 ? 5 : 0,
    word_count_penalty: wordCount < 30 ? -10 : 0,
    author_bonus: article.author ? 5 : 0,
    published_date_bonus: article.published_at ? 3 : 0,
    error_penalty: (title.toLowerCase().includes('error') || title.toLowerCase().includes('404')) ? -50 : 0,
    body_length_penalty: (body.length > 0 && body.length < title.length * 2) ? -15 : 0,
    credibility_score: credibilityScore,
    threshold_used: credibilityScore >= 90 ? 15 : 30
  }
}

async function enhanceContent(url: string): Promise<any> {
  try {
    // Dynamic import of the UniversalContentExtractor
    const { UniversalContentExtractor } = await import('../_shared/universal-content-extractor.ts')
    
    const extractor = new UniversalContentExtractor(url)
    const html = await extractor.fetchWithRetry(url, 3)
    const extracted = extractor.extractContentFromHTML(html, url)
    
    return {
      title: extracted.title,
      body: extracted.body,
      author: extracted.author,
      published_at: extracted.published_at
    }
  } catch (error) {
    throw new Error(`Content enhancement failed: ${error.message}`)
  }
}

function findKeywordMatches(article: any, topic: any): string[] {
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