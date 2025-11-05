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

    // Parse request body for options
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const { topicId } = body
    const autoTriggerScraping = body.autoTriggerScraping ?? true // Default to TRUE for automation

    console.log(`🔍 Starting daily content monitoring... (Auto-scraping: ${autoTriggerScraping ? 'ENABLED' : 'DISABLED'})`)

    // Get active topic-source combinations (optionally scoped to a single topic to reduce cold-start load)
    let tsQuery = supabase
      .from('topic_sources')
      .select(`
        topic_id,
        source_id,
        is_active,
        topics!inner (
          id,
          name,
          is_active,
          topic_type,
          region,
          keywords,
          landmarks,
          postcodes,
          organizations,
          branding_config,
          negative_keywords,
          competing_regions
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

    if (topicId) {
      tsQuery = tsQuery.eq('topic_id', topicId)
    }

    const { data: topicSources, error: tsError } = await tsQuery

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
        const { data: insertResult, error: insertError } = await supabase
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
            error_message: null,
            auto_scrape_triggered: false
          }, { 
            onConflict: 'topic_id,source_id,check_date',
            ignoreDuplicates: false 
          })
          .select()
          .single()

        if (insertError) {
          throw new Error(`Failed to store availability data: ${insertError.message}`)
        }

        // PROACTIVE SCRAPING: Trigger auto-scrape if new content detected
        let autoScrapeTriggered = false
        if (autoTriggerScraping && newTopicRelevantUrls.length >= 1 && (topicSource.topics as any)?.topic_type === 'regional') {
          console.log(`🚨 New content detected for ${(topicSource.topics as any)?.name}: ${newTopicRelevantUrls.length} URLs`)
          
          // Check cooldown period (4 hours)
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
          const { data: recentScrape } = await supabase
            .from('daily_content_availability')
            .select('created_at, auto_scrape_triggered')
            .eq('topic_id', topicSource.topic_id)
            .eq('source_id', topicSource.source_id)
            .eq('auto_scrape_triggered', true)
            .gte('created_at', fourHoursAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          
          if (!recentScrape) {
            console.log(`🔥 Triggering auto-scrape for ${(topicSource.topics as any)?.name}`)
            
            // Trigger scraper asynchronously
            const scrapePromise = supabase.functions.invoke('universal-topic-scraper', {
              body: {
                topicId: topicSource.topic_id,
                sourceIds: [topicSource.source_id],
                forceRescrape: false,
                testMode: false
              }
            })
            
            // Mark as triggered immediately (don't wait for completion)
            await supabase
              .from('daily_content_availability')
              .update({ 
                auto_scrape_triggered: true,
                auto_scrape_completed_at: new Date().toISOString()
              })
              .eq('id', insertResult.id)
            
            autoScrapeTriggered = true
            
            // Log result in background
            scrapePromise.then(result => {
              if (result.error) {
                console.error(`❌ Auto-scrape failed for ${(topicSource.topics as any)?.name}:`, result.error)
              } else {
                console.log(`✅ Auto-scrape completed for ${(topicSource.topics as any)?.name}`)
              }
            })
          } else {
            console.log(`⏳ Cooldown active for ${(topicSource.topics as any)?.name} - last scrape at ${recentScrape.created_at}`)
          }
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
          auto_scrape_triggered: autoScrapeTriggered,
          success: true
        })

        console.log(`✅ ${(topicSource.content_sources as any)?.source_name || 'Unknown Source'}: ${newTopicRelevantUrls.length} new topic-relevant URLs (${discoveryResult.urls.length} total, ${topicRelevantUrls.length} relevant)${autoScrapeTriggered ? ' [AUTO-SCRAPE TRIGGERED]' : ''}`)

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
    const autoScrapesTriggered = successful.filter(r => r.auto_scrape_triggered).length

    console.log(`📋 Daily content monitoring completed:`)
    console.log(`   ✅ ${successful.length} sources checked successfully`)
    console.log(`   ❌ ${failed.length} sources failed`)
    console.log(`   🆕 ${totalNewUrls} total new URLs discovered`)
    console.log(`   🔥 ${autoScrapesTriggered} auto-scrapes triggered`)

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_sources: results.length,
          successful: successful.length,
          failed: failed.length,
          total_new_urls: totalNewUrls,
          auto_scrapes_triggered: autoScrapesTriggered
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
  if (topic.topic_type !== 'regional') {
    return urls
  }

  const preferences = extractRegionalFilterPreferences(topic)

  if (preferences.skipFiltering) {
    console.log(`ℹ️ Skipping regional relevance filter for ${(topic.name || 'unknown topic')} due to configuration override`)
    return urls
  }

  if (preferences.allowVariants.length === 0 && preferences.allowIfNoPositiveTerms) {
    console.warn(`⚠️ No allowlist variants configured for ${(topic.name || 'unknown topic')} - allowing all URLs from ${sourceName}`)
    return urls
  }

  const requirePositiveMatch = preferences.requirePositiveMatch ?? (
    preferences.allowVariants.length > 0 && !preferences.allowOverlap
  )

  const relevantUrls = urls.filter(url => {
    const normalizedUrl = url.toLowerCase()
    const hasAllowMatch = preferences.allowVariants.some(variant => normalizedUrl.includes(variant))
    const hasBlockMatch = preferences.blockVariants.some(variant => normalizedUrl.includes(variant))

    if (hasBlockMatch && !hasAllowMatch) {
      return false
    }

    if (hasAllowMatch) {
      return true
    }

    if (!requirePositiveMatch || preferences.allowOverlap) {
      return !hasBlockMatch
    }

    return false
  })

  const topicLabel = (topic.name || topic.region || 'regional topic').toLowerCase()
  console.log(
    `🎯 Topic relevance filter for ${topicLabel}: ${relevantUrls.length}/${urls.length} URLs kept (allow variants: ${preferences.allowVariants.length}, block variants: ${preferences.blockVariants.length}, require match: ${requirePositiveMatch})`
  )

  return relevantUrls
}

interface RegionalFilterPreferences {
  allowVariants: string[]
  blockVariants: string[]
  allowOverlap: boolean
  requirePositiveMatch?: boolean
  allowIfNoPositiveTerms: boolean
  skipFiltering: boolean
}

function extractRegionalFilterPreferences(topic: any): RegionalFilterPreferences {
  const allowTerms = new Set<string>()
  const blockTerms = new Set<string>()

  addTermsToSet(allowTerms, topic.region)
  addTermsToSet(allowTerms, topic.keywords)
  addTermsToSet(allowTerms, topic.landmarks)
  addTermsToSet(allowTerms, topic.postcodes)
  addTermsToSet(allowTerms, topic.organizations)

  addTermsToSet(blockTerms, topic.competing_regions)
  addTermsToSet(blockTerms, topic.negative_keywords)

  const brandingConfig = topic?.branding_config ?? null
  const regionalFilter = resolveRegionalFilterConfig(brandingConfig)

  if (regionalFilter) {
    addTermsToSet(allowTerms, regionalFilter.allowTerms)
    addTermsToSet(allowTerms, regionalFilter.overlapRegions)
    addTermsToSet(blockTerms, regionalFilter.blockTerms)

    const allowOverlap = toOptionalBoolean(regionalFilter.allowOverlap)
    const requireExplicit = toOptionalBoolean(regionalFilter.requireExplicitMatch)
    const allowIfNoMatch = toOptionalBoolean(regionalFilter.allowIfNoMatch)
    const skipFiltering = toOptionalBoolean(regionalFilter.skipFiltering)

    return {
      allowVariants: Array.from(allowTerms),
      blockVariants: Array.from(blockTerms),
      allowOverlap: allowOverlap ?? false,
      requirePositiveMatch: requireExplicit,
      allowIfNoPositiveTerms: allowIfNoMatch ?? true,
      skipFiltering: skipFiltering ?? false,
    }
  }

  return {
    allowVariants: Array.from(allowTerms),
    blockVariants: Array.from(blockTerms),
    allowOverlap: false,
    allowIfNoPositiveTerms: true,
    skipFiltering: false,
  }
}

interface RegionalFilterConfigInput {
  allowTerms?: unknown
  overlapRegions?: unknown
  blockTerms?: unknown
  allowOverlap?: unknown
  requireExplicitMatch?: unknown
  allowIfNoMatch?: unknown
  skipFiltering?: unknown
}

function resolveRegionalFilterConfig(brandingConfig: unknown): RegionalFilterConfigInput | null {
  if (!brandingConfig) {
    return null
  }

  let configObject = brandingConfig
  if (typeof brandingConfig === 'string') {
    try {
      configObject = JSON.parse(brandingConfig)
    } catch (error) {
      console.warn('⚠️ Failed to parse branding_config for regional filter overrides:', error)
      return null
    }
  }

  if (typeof configObject !== 'object' || configObject === null) {
    return null
  }

  const record = configObject as Record<string, any>
  const candidate = record.regional_filter || record.regionalFilter || record.regionalFilterConfig

  if (typeof candidate === 'string') {
    try {
      return resolveRegionalFilterConfig(JSON.parse(candidate))
    } catch (error) {
      console.warn('⚠️ Failed to parse regional filter configuration string:', error)
      return null
    }
  }

  const configSource = candidate && typeof candidate === 'object'
    ? candidate
    : isRegionalFilterLike(record)
      ? record
      : null

  if (configSource) {
    return {
      allowTerms: (configSource.allow_terms ?? configSource.allowTerms ?? configSource.additionalAllowTerms) as unknown,
      overlapRegions: (configSource.overlap_regions ?? configSource.overlapRegions ?? configSource.additionalRegions) as unknown,
      blockTerms: (configSource.block_terms ?? configSource.blockTerms ?? configSource.denylist ?? configSource.blocklist) as unknown,
      allowOverlap: configSource.allow_overlap ?? configSource.allowOverlap,
      requireExplicitMatch: configSource.require_explicit_match ?? configSource.requireExplicitMatch ?? configSource.strict,
      allowIfNoMatch: configSource.allow_if_no_match ?? configSource.allowIfNoMatch,
      skipFiltering: configSource.skip_filtering ?? configSource.skipFiltering ?? configSource.disable,
    }
  }

  return null
}

function isRegionalFilterLike(value: Record<string, any>): boolean {
  const possibleKeys = [
    'allow_terms', 'allowTerms', 'additionalAllowTerms',
    'overlap_regions', 'overlapRegions', 'additionalRegions',
    'block_terms', 'blockTerms', 'denylist', 'blocklist',
    'allow_overlap', 'allowOverlap',
    'require_explicit_match', 'requireExplicitMatch', 'strict',
    'allow_if_no_match', 'allowIfNoMatch',
    'skip_filtering', 'skipFiltering', 'disable'
  ]

  return possibleKeys.some(key => key in value)
}

function addTermsToSet(target: Set<string>, value: unknown) {
  const terms = normalizeToStringArray(value)
  for (const term of terms) {
    for (const variant of buildTermVariants(term)) {
      target.add(variant)
    }
  }
}

function normalizeToStringArray(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item : item != null ? String(item) : ''))
      .filter(Boolean)
  }
  return []
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }

  return undefined
}

function buildTermVariants(term: string, visited: Set<string> = new Set()): string[] {
  if (!term) return []

  const trimmed = term.trim()
  if (!trimmed) return []

  const lower = trimmed.toLowerCase()
  if (visited.has(lower)) {
    return []
  }

  visited.add(lower)

  const variants = new Set<string>()
  const addVariant = (value?: string | null) => {
    if (!value) return
    const normalized = value.trim().toLowerCase()
    if (!normalized) return

    const withoutSpaces = normalized.replace(/\s+/g, '')
    const hyphenated = normalized.replace(/\s+/g, '-')
    const withoutApostrophes = normalized.replace(/['']/g, '')

    variants.add(normalized)
    variants.add(withoutSpaces)
    variants.add(hyphenated)
    variants.add(withoutApostrophes)
    variants.add(withoutApostrophes.replace(/\s+/g, ''))
    variants.add(withoutApostrophes.replace(/\s+/g, '-'))
  }

  addVariant(trimmed)

  const segments = trimmed
    .split(/[,/&]| & | and |[–-]/)
    .map(part => part.trim())
    .filter(Boolean)

  for (const segment of segments) {
    addVariant(segment)
    if (!visited.has(segment.toLowerCase())) {
      buildTermVariants(segment, visited).forEach(variant => variants.add(variant))
    }
  }

  if (lower.startsWith('st ')) {
    const remainder = trimmed.slice(3).trim()
    if (remainder) {
      addVariant(`st ${remainder}`)
      addVariant(`st. ${remainder}`)
      addVariant(`st-${remainder.replace(/\s+/g, '-')}`)
      addVariant(`saint ${remainder}`)
      if (!visited.has(remainder.toLowerCase())) {
        buildTermVariants(remainder, visited).forEach(variant => variants.add(variant))
      }
    }
  }

  return Array.from(variants).filter(Boolean)
}