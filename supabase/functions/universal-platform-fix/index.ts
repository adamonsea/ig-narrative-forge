import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Starting universal platform fix...')

    // 1. Auto-generate missing scrape schedules
    const { data: scheduleResult, error: scheduleError } = await supabase
      .rpc('auto_generate_missing_schedules')

    if (scheduleError) {
      console.error('Failed to generate schedules:', scheduleError)
    } else {
      console.log('Schedule generation result:', scheduleResult)
    }

    // 2. Fix content validation by updating validation logic in scrapers
    await fixContentValidation(supabase)

    // 3. Update source health for all sources
    await updateSourceHealthMetrics(supabase)

    // 4. Recover unhealthy sources
    const { data: recoveryResult, error: recoveryError } = await supabase
      .rpc('recover_unhealthy_sources')

    if (recoveryError) {
      console.error('Failed to recover sources:', recoveryError)
    } else {
      console.log('Recovery result:', recoveryResult)
    }

    // 5. Fix regional relevance scoring by updating articles with zero scores
    await fixRegionalRelevanceScoring(supabase)

    // Log the platform fix completion
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Universal platform fix completed successfully',
      context: {
        schedules_created: scheduleResult?.schedules_created || 0,
        sources_recovered: recoveryResult?.sources_recovered || 0,
        sources_deactivated: recoveryResult?.sources_deactivated || 0,
        fix_timestamp: new Date().toISOString()
      },
      function_name: 'universal_platform_fix'
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Universal platform fix completed successfully',
        results: {
          schedules: scheduleResult,
          recovery: recoveryResult,
          timestamp: new Date().toISOString()
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Universal platform fix failed:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Universal platform fix failed',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function fixContentValidation(supabase: any) {
  console.log('Fixing content validation logic...')
  
  // Update articles that were incorrectly discarded due to overly aggressive validation
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, body, import_metadata')
    .eq('processing_status', 'discarded')
    .contains('import_metadata', { rejection_reason: 'INVALID_CONTENT' })
    .limit(100)

  if (error) {
    console.error('Failed to fetch discarded articles:', error)
    return
  }

  let recoveredCount = 0
  
  for (const article of articles || []) {
    // Check if the article actually has valid content
    if (article.title && article.body && article.body.length > 100) {
      // Restore the article to pending status
      await supabase
        .from('articles')
        .update({
          processing_status: 'new',
          import_metadata: {
            ...article.import_metadata,
            restored_by_platform_fix: true,
            restored_at: new Date().toISOString(),
            original_rejection_reason: article.import_metadata?.rejection_reason
          }
        })
        .eq('id', article.id)
      
      recoveredCount++
    }
  }
  
  console.log(`Recovered ${recoveredCount} articles from invalid content rejection`)
}

async function updateSourceHealthMetrics(supabase: any) {
  console.log('Updating source health metrics...')
  
  // Get all active sources and initialize their health metrics
  const { data: sources, error } = await supabase
    .from('content_sources')
    .select('id, source_name, articles_scraped, last_scraped_at')
    .eq('is_active', true)

  if (error) {
    console.error('Failed to fetch sources:', error)
    return
  }

  for (const source of sources || []) {
    // Calculate initial health score based on scraping history
    const healthScore = calculateInitialHealthScore(source)
    const successRate = source.articles_scraped > 0 ? Math.min(100, source.articles_scraped * 10) : 50
    
    // Insert or update health metrics
    const { error: metricsError } = await supabase
      .from('source_health_metrics')
      .upsert({
        source_id: source.id,
        health_score: healthScore,
        success_rate: successRate,
        last_successful_scrape: source.last_scraped_at,
        consecutive_failures: 0,
        recommended_action: healthScore >= 80 ? 'none' : (healthScore >= 60 ? 'monitor' : 'investigate'),
        last_health_check: new Date().toISOString()
      }, {
        onConflict: 'source_id'
      })

    if (metricsError) {
      console.error(`Failed to update metrics for source ${source.id}:`, metricsError)
    }
  }
  
  console.log(`Updated health metrics for ${sources?.length || 0} sources`)
}

function calculateInitialHealthScore(source: any): number {
  let score = 100
  
  // Reduce score if never scraped successfully
  if (!source.articles_scraped || source.articles_scraped === 0) {
    score -= 30
  }
  
  // Reduce score if not scraped recently
  if (!source.last_scraped_at) {
    score -= 20
  } else {
    const daysSinceLastScrape = (Date.now() - new Date(source.last_scraped_at).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceLastScrape > 7) {
      score -= 25
    } else if (daysSinceLastScrape > 3) {
      score -= 10
    }
  }
  
  // Reduce score for low article count
  if (source.articles_scraped < 5) {
    score -= 15
  }
  
  return Math.max(20, Math.min(100, score))
}

async function fixRegionalRelevanceScoring(supabase: any) {
  console.log('Fixing regional relevance scoring...')
  
  // Update articles with zero regional relevance scores for regional topics
  const { data: articles, error } = await supabase
    .from('articles')
    .select(`
      id, title, body, regional_relevance_score,
      topics!inner(id, topic_type, region, landmarks, keywords)
    `)
    .eq('topics.topic_type', 'regional')
    .eq('regional_relevance_score', 0)
    .limit(100)

  if (error) {
    console.error('Failed to fetch articles for rescoring:', error)
    return
  }

  let rescoredCount = 0
  
  for (const article of articles || []) {
    const topic = article.topics
    const content = `${article.title} ${article.body}`.toLowerCase()
    
    // Calculate proper regional relevance score
    let score = 0
    
    // Check for region name in content
    if (topic.region && content.includes(topic.region.toLowerCase())) {
      score += 40
    }
    
    // Check for landmarks
    if (topic.landmarks) {
      for (const landmark of topic.landmarks) {
        if (content.includes(landmark.toLowerCase())) {
          score += 20
          break
        }
      }
    }
    
    // Check for keywords if any
    if (topic.keywords) {
      for (const keyword of topic.keywords) {
        if (content.includes(keyword.toLowerCase())) {
          score += 15
          break
        }
      }
    }
    
    // Update the article with the new score
    if (score > 0) {
      await supabase
        .from('articles')
        .update({
          regional_relevance_score: score,
          import_metadata: {
            rescored_by_platform_fix: true,
            rescored_at: new Date().toISOString(),
            original_score: 0,
            new_score: score
          }
        })
        .eq('id', article.id)
      
      rescoredCount++
    }
  }
  
  console.log(`Rescored ${rescoredCount} articles with proper regional relevance`)
}