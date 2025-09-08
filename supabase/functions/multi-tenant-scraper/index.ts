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
        const qualityScore = calculateQualityScore(article)
        
        // Skip if fails topic filtering
        if (relevanceScore < 5 || qualityScore < 30) {
          console.log(`Skipping article due to low scores: ${article.title}`)
          continue
        }

        // Insert or update shared content
        const { data: sharedContent, error: contentError } = await supabase
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
            word_count: calculateWordCount(article.body || ''),
            language: article.language || 'en',
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
              keyword_matches: findKeywordMatches(article, topic)
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
              title: article.title,
              body: article.body,
              author: article.author,
              source_url: article.source_url,
              image_url: article.image_url,
              canonical_url: article.canonical_url,
              published_at: article.published_at,
              word_count: calculateWordCount(article.body || ''),
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
  
  // Word count scoring
  if (wordCount > 300) score += 20
  else if (wordCount > 150) score += 10
  else if (wordCount < 50) score -= 30
  
  // Title quality
  if (title.length > 30 && title.length < 100) score += 10
  if (title.includes('?') || title.includes('!')) score += 5
  
  // Content quality indicators
  if (article.author) score += 10
  if (article.published_at) score += 5
  if (article.image_url) score += 5
  
  // Negative quality indicators
  if (title.toLowerCase().includes('error') || title.toLowerCase().includes('404')) score -= 50
  if (body.length < title.length * 2) score -= 20
  
  return Math.min(100, Math.max(0, score))
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