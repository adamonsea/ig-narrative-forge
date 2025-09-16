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
        console.log(`🔍 Checking: ${topicSource.content_sources.source_name} for topic ${topicSource.topics.name}`)

        // Discover URLs from the source
        const discoveryResult = await discoverUrls(topicSource.content_sources.feed_url)
        
        if (!discoveryResult.success) {
          throw new Error(discoveryResult.error || 'URL discovery failed')
        }

        // Check which URLs we've seen before for this topic
        const { data: seenUrls, error: seenError } = await supabase
          .from('scraped_urls_history')
          .select('url')
          .eq('topic_id', topicSource.topic_id)
          .eq('source_id', topicSource.source_id)
          .in('url', discoveryResult.urls)

        if (seenError) {
          throw new Error(`Failed to check seen URLs: ${seenError.message}`)
        }

        const seenUrlSet = new Set(seenUrls?.map(u => u.url) || [])
        const newUrls = discoveryResult.urls.filter(url => !seenUrlSet.has(url))

        const checkDuration = Date.now() - startTime

        // Store the daily availability data
        const { error: insertError } = await supabase
          .from('daily_content_availability')
          .upsert({
            topic_id: topicSource.topic_id,
            source_id: topicSource.source_id,
            check_date: new Date().toISOString().split('T')[0], // Today's date
            new_urls_found: newUrls.length,
            total_urls_discovered: discoveryResult.urls.length,
            urls_already_seen: discoveryResult.urls.length - newUrls.length,
            discovery_method: discoveryResult.method,
            check_duration_ms: checkDuration,
            success: true,
            error_message: null
          })

        if (insertError) {
          throw new Error(`Failed to store availability data: ${insertError.message}`)
        }

        results.push({
          topic_id: topicSource.topic_id,
          topic_name: topicSource.topics.name,
          source_id: topicSource.source_id,
          source_name: topicSource.content_sources.source_name,
          new_urls: newUrls.length,
          total_urls: discoveryResult.urls.length,
          duration_ms: checkDuration,
          success: true
        })

        console.log(`✅ ${topicSource.content_sources.source_name}: ${newUrls.length} new URLs (${discoveryResult.urls.length} total)`)

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
            urls_already_seen: 0,
            discovery_method: null,
            check_duration_ms: checkDuration,
            success: false,
            error_message: error.message
          })

        results.push({
          topic_id: topicSource.topic_id,
          topic_name: topicSource.topics.name,
          source_id: topicSource.source_id,
          source_name: topicSource.content_sources.source_name,
          error: error.message,
          duration_ms: checkDuration,
          success: false
        })

        console.error(`❌ ${topicSource.content_sources.source_name}: ${error.message}`)
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
        error: error.message
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
      error: error.message
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