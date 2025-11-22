import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BackupRequest {
  topic_ids: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { topic_ids }: BackupRequest = await req.json()

    console.log(`📦 Backing up ${topic_ids.length} topics`)

    const backupData = []

    for (const topicId of topic_ids) {
      // Get topic metadata
      const { data: topic } = await supabase
        .from('topics')
        .select('*')
        .eq('id', topicId)
        .single()

      if (!topic) continue

      // Get topic sources
      const { data: topicSources } = await supabase
        .from('topic_sources')
        .select(`
          *,
          content_sources (*)
        `)
        .eq('topic_id', topicId)

      // Get legacy articles
      const { data: legacyArticles } = await supabase
        .from('articles')
        .select('*')
        .eq('topic_id', topicId)

      // Get multi-tenant articles
      const { data: topicArticles } = await supabase
        .from('topic_articles')
        .select(`
          *,
          shared_article_content (*)
        `)
        .eq('topic_id', topicId)

      // Get stories (both architectures)
      const legacyArticleIds = legacyArticles?.map(a => a.id) || []
      const topicArticleIds = topicArticles?.map(ta => ta.id) || []

      const { data: stories } = await supabase
        .from('stories')
        .select(`
          *,
          slides (*)
        `)
        .or(`article_id.in.(${legacyArticleIds.join(',')}),topic_article_id.in.(${topicArticleIds.join(',')})`)

      // Get events
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('topic_id', topicId)

      // Get parliamentary mentions
      const { data: parliamentaryMentions } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('topic_id', topicId)

      // Get sentiment data
      const { data: sentimentCards } = await supabase
        .from('sentiment_cards')
        .select('*')
        .eq('topic_id', topicId)

      // Get community insights
      const { data: communityInsights } = await supabase
        .from('community_insights')
        .select('*')
        .eq('topic_id', topicId)

      // Get discarded articles
      const { data: discardedArticles } = await supabase
        .from('discarded_articles')
        .select('*')
        .eq('topic_id', topicId)

      backupData.push({
        topic,
        sources: topicSources,
        legacy_articles: legacyArticles,
        topic_articles: topicArticles,
        stories,
        events,
        parliamentary_mentions: parliamentaryMentions,
        sentiment_cards: sentimentCards,
        community_insights: communityInsights,
        discarded_articles: discardedArticles,
        backup_timestamp: new Date().toISOString(),
      })

      console.log(`✅ Backed up topic: ${topic.name}`)
    }

    // Log the backup
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Topic backup completed',
      context: {
        topic_count: topic_ids.length,
        backup_timestamp: new Date().toISOString(),
      },
      function_name: 'backup-topics',
    })

    return new Response(JSON.stringify({
      success: true,
      backup_data: backupData,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Backup error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
