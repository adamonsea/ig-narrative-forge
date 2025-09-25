import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DiscoveryResult {
  urls: string[]
  method: 'rss' | 'html'
  success: boolean
  error?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('🔍 Starting daily content monitoring...')

    // Get all active topic-source combinations
    const { data: topicSources, error: tsError } = await supabase
      .from('topic_sources')
      .select(`
        topic_id,
        source_id,
        is_active,
        topics!inner (
          id,
          name,
          is_active
        ),
        content_sources!inner (
          id,
          source_name,
          feed_url,
          is_active
        )
      `)
      .eq('is_active', true)
      .eq('topics.is_active', true)
      .eq('content_sources.is_active', true)

    if (tsError) {
      throw new Error(`Failed to fetch topic sources: ${tsError.message}`)
    }

    console.log(`📊 Found ${topicSources?.length || 0} active topic-source combinations`)

    const results = []

    for (const topicSource of topicSources || []) {
      const startTime = Date.now()
      
      try {
        console.log(`🔍 Checking: ${(topicSource.content_sources as any)?.source_name || 'Unknown Source'} for topic ${(topicSource.topics as any)?.name || 'Unknown Topic'}`)

        // Discover URLs from the source
        const discoveryResult = await discoverUrls((topicSource.content_sources as any)?.feed_url)
        
        if (!discoveryResult.success) {
          throw new Error(discoveryResult.error || 'URL discovery failed')
        }


        // Filter URLs for topic relevance (for regional topics)
        const topicRelevantUrls = await filterUrlsByTopicRelevance(
          discoveryResult.urls, 
          topicSource.topics,
          (topicSource.content_sources as any)?.source_name || 'Unknown Source'
        )
        
        // Check which topic-relevant URLs we've seen before
        const { data: seenUrls, error: seenError } = await supabase
          .from('scraped_urls_history')
          .select('url')
          .eq('topic_id', topicSource.topic_id)
          .eq('source_id', topicSource.source_id)
          .in('url', topicRelevantUrls)

        if (seenError) {
          throw new Error(`Failed to check seen URLs: ${seenError.message}`)
        }

        const seenUrlSet = new Set(seenUrls?.map(u => u.url) || [])
        const newTopicRelevantUrls = topicRelevantUrls.filter(url => !seenUrlSet.has(url))

        const checkDuration = Date.now() - startTime

        // Store the daily availability data
        const { error: insertError } = await supabase
          .from('daily_content_availability')
          .upsert({
            topic_id: topicSource.topic_id,
            source_id: topicSource.source_id,
            check_date: new Date().toISOString().split('T')[0], // Today's date
            new_urls_found: newTopicRelevantUrls.length,
            total_urls_discovered: discoveryResult.urls.length,
            topic_relevant_urls: topicRelevantUrls.length,
            urls_already_seen: topicRelevantUrls.length - newTopicRelevantUrls.length,
            discovery_method: discoveryResult.method,
            check_duration_ms: checkDuration,
            success: true,
            error_message: null
          }, { 
            onConflict: 'topic_id,source_id,check_date',
            ignoreDuplicates: false 
          })

        if (insertError) {
          throw new Error(`Failed to store availability data: ${insertError.message}`)
        }

        results.push({
          topic_id: topicSource.topic_id,
          topic_name: (topicSource.topics as any)?.name || 'Unknown Topic',
          source_id: topicSource.source_id,
          source_name: (topicSource.content_sources as any)?.source_name || 'Unknown Source',
          new_urls: newTopicRelevantUrls.length,
          total_urls: discoveryResult.urls.length,
          topic_relevant_urls: topicRelevantUrls.length,
          duration_ms: checkDuration,
          success: true
        })

        console.log(`✅ ${topicSource.content_sources.source_name}: ${newTopicRelevantUrls.length} new topic-relevant URLs (${discoveryResult.urls.length} total, ${topicRelevantUrls.length} relevant)`)

      } catch (error) {
        const checkDuration = Date.now() - startTime
        
        // Store error result
        await supabase
          .from('daily_content_availability')
          .upsert({
            topic_id: topicSource.topic_id,
            source_id: topicSource.source_id,
            check_date: new Date().toISOString().split('T')[0],
            new_urls_found: 0,
            total_urls_discovered: 0,
            topic_relevant_urls: 0,
            urls_already_seen: 0,
            discovery_method: null,
            check_duration_ms: checkDuration,
            success: false,
            error_message: error instanceof Error ? error.message : String(error)
          }, { 
            onConflict: 'topic_id,source_id,check_date',
            ignoreDuplicates: false 
          })

        results.push({
          topic_id: topicSource.topic_id,
          topic_name: (topicSource.topics as any)?.name || 'Unknown Topic',
          source_id: topicSource.source_id,
          source_name: (topicSource.content_sources as any)?.source_name || 'Unknown Source',
          error: error instanceof Error ? error.message : String(error),
          duration_ms: checkDuration,
          success: false
        })

        console.error(`❌ ${(topicSource.content_sources as any)?.source_name || 'Unknown Source'}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Log summary
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    const totalNewUrls = successful.reduce((sum, r) => sum + (r.new_urls || 0), 0)

    console.log(`📋 Daily content monitoring completed:`)
    console.log(`   ✅ ${successful.length} sources checked successfully`)
    console.log(`   ❌ ${failed.length} sources failed`)
    console.log(`   🆕 ${totalNewUrls} total new URLs discovered`)

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_sources: results.length,
          successful: successful.length,
          failed: failed.length,
          total_new_urls: totalNewUrls
        },
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Daily content monitoring failed:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

async function discoverUrls(feedUrl: string): Promise<DiscoveryResult> {
  try {
    console.log(`🌐 Discovering URLs from: ${feedUrl}`)
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'eeZee News Content Monitor/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    // Try RSS/Atom first
    if (contentType.includes('xml') || text.includes('<rss') || text.includes('<feed')) {
      console.log('📡 Parsing as RSS/Atom feed')
      const urls = extractUrlsFromRss(text)
      return {
        urls,
        method: 'rss',
        success: true
      }
    }

    // Fall back to HTML parsing
    console.log('🌐 Parsing as HTML page')
    const urls = extractUrlsFromHtml(text, feedUrl)
    return {
      urls,
      method: 'html',
      success: true
    }

  } catch (error) {
    return {
      urls: [],
      method: 'html',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function extractUrlsFromRss(xmlContent: string): string[] {
  const urls: string[] = []
  const linkRegex = /<link[^>]*>([^<]*)<\/link>|<link[^>]*href=["']([^"']*)["'][^>]*\/?>/gi
  
  let match
  while ((match = linkRegex.exec(xmlContent)) !== null) {
    const url = match[1] || match[2]
    if (url && url.startsWith('http')) {
      urls.push(url.trim())
    }
  }
  
  return [...new Set(urls)] // Remove duplicates
}

function extractUrlsFromHtml(htmlContent: string, baseUrl: string): string[] {
  const urls: string[] = []
  const domain = new URL(baseUrl).hostname
  
  // Look for article links
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
  
  let match
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    let url = match[1]
    
    // Normalize URLs - strip tracking parameters
    url = normalizeUrl(url)
    
    // Convert relative URLs to absolute
    if (url.startsWith('/')) {
      url = `https://${domain}${url}`
    } else if (url.startsWith('./')) {
      url = `https://${domain}${url.substring(1)}`
    } else if (!url.startsWith('http')) {
      continue // Skip invalid URLs
    }
    
    // Filter for likely article URLs
    if (url.includes(domain) && 
        (url.includes('/news/') || 
         url.includes('/article') || 
         url.includes('/story') ||
         /\/\d{4}\//.test(url))) { // Articles often have year in path
      urls.push(url)
    }
  }
  
  return [...new Set(urls)] // Remove duplicates
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // Remove common tracking parameters that cause scraper blocks
    urlObj.searchParams.delete('ref')
    urlObj.searchParams.delete('utm_source')
    urlObj.searchParams.delete('utm_medium')
    urlObj.searchParams.delete('utm_campaign')
    urlObj.searchParams.delete('utm_content')
    return urlObj.toString()
  } catch {
    return url
  }
}

async function filterUrlsByTopicRelevance(urls: string[], topic: any, sourceName: string): Promise<string[]> {
  // For regional topics, filter URLs that are likely relevant to the region
  if (topic.topic_type === 'regional' && topic.region) {
    const region = topic.region.toLowerCase()
    const keywords = topic.keywords || []
    
    const relevantUrls = urls.filter(url => {
      const urlLower = url.toLowerCase()
      
      // Check if URL contains region name or keywords
      const hasRegion = urlLower.includes(region)
      const hasKeyword = keywords.some((keyword: string) => 
        urlLower.includes(keyword.toLowerCase())
      )
      
      // Special handling for Eastbourne sources
      if (region === 'eastbourne') {
        return hasRegion || hasKeyword || 
               urlLower.includes('/local-news/eastbourne') ||
               urlLower.includes('/eastbourne-news/') ||
               urlLower.includes('stone-cross') ||
               urlLower.includes('polegate')
      }
      
      return hasRegion || hasKeyword
    })
    
    console.log(`🎯 Topic relevance filter: ${relevantUrls.length}/${urls.length} URLs relevant for ${region}`)
    return relevantUrls
  }
  
  // For keyword topics, return all URLs (filtering happens during scraping)
  return urls
}