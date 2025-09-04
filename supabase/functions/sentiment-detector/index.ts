import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ArticleData {
  id: string;
  title: string;
  body: string;
  source_url: string;
  published_at: string;
  author?: string;
}

interface KeywordAnalysis {
  phrase: string;
  frequency: number;
  sentiment_context: string[];
  sources: Array<{
    url: string;
    title: string;
    date: string;
    author?: string;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🔍 Starting sentiment detection process');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');

    if (!deepseekApiKey) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topic_id, force_analysis = false } = await req.json();

    if (!topic_id) {
      throw new Error('topic_id is required');
    }

    console.log(`📊 Analyzing sentiment for topic: ${topic_id}`);

    // Check if analysis should run (based on frequency setting)
    const { data: settings } = await supabase
      .from('topic_sentiment_settings')
      .select('*')
      .eq('topic_id', topic_id)
      .single();

    if (!settings?.enabled && !force_analysis) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Sentiment tracking disabled for this topic' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if analysis was run recently
    if (!force_analysis && settings?.last_analysis_at) {
      const hoursSinceLastAnalysis = (Date.now() - new Date(settings.last_analysis_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastAnalysis < (settings?.analysis_frequency_hours || 24)) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Analysis already completed recently' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Get recent articles for this topic (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('id, title, body, source_url, published_at, author')
      .eq('topic_id', topic_id)
      .gte('published_at', sevenDaysAgo)
      .order('published_at', { ascending: false })
      .limit(50);

    // Also get published stories with their content from slides
    const { data: publishedStories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id, title, author, created_at,
        article_id,
        articles!inner(source_url, topic_id, published_at),
        slides(content)
      `)
      .eq('articles.topic_id', topic_id)
      .eq('is_published', true)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    // Combine articles and published story content
    const allContent: ArticleData[] = [
      ...(articles || []),
      ...(publishedStories || []).map(story => ({
        id: story.id,
        title: story.title,
        body: story.slides?.map(s => s.content).join(' ') || '',
        source_url: story.articles?.source_url || '',
        published_at: story.articles?.published_at || story.created_at,
        author: story.author
      }))
    ];

    if (!allContent.length) {
      console.log('📭 No recent content found for analysis');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No recent content to analyze' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📰 Found ${allContent.length} content items for analysis (${articles.length} articles + ${publishedStories?.length || 0} published stories)`);

    // Get topic info for context
    const { data: topic } = await supabase
      .from('topics')
      .select('name, keywords')
      .eq('id', topic_id)
      .single();

    // Extract trending keywords and analyze sentiment using DeepSeek
    const keywordAnalysis = await analyzeKeywordsAndSentiment(
      allContent, 
      topic?.keywords || [],
      settings?.excluded_keywords || [],
      deepseekApiKey
    );

    console.log(`🔍 Identified ${keywordAnalysis.length} trending keywords`);

    // Generate sentiment cards for significant trends
    let cardsCreated = 0;
    for (const analysis of keywordAnalysis) {
      if (analysis.frequency >= 3) { // Minimum threshold
        const cardContent = await generateSentimentCard(analysis, topic?.name || 'Topic', deepseekApiKey);
        
        if (cardContent) {
          // Insert sentiment card
          const { error: insertError } = await supabase
            .from('sentiment_cards')
            .insert({
              topic_id,
              keyword_phrase: analysis.phrase,
              content: cardContent.content,
              sources: analysis.sources,
              sentiment_score: cardContent.sentiment_score,
              confidence_score: cardContent.confidence_score,
              card_type: cardContent.card_type
            });

          if (!insertError) {
            cardsCreated++;
            console.log(`✅ Created sentiment card for: ${analysis.phrase}`);
          } else {
            console.error(`❌ Failed to create card for ${analysis.phrase}:`, insertError);
          }
        }
      }
    }

    // Update last analysis time
    await supabase
      .from('topic_sentiment_settings')
      .upsert({
        topic_id,
        enabled: true,
        last_analysis_at: new Date().toISOString(),
        ...(settings ? {} : { analysis_frequency_hours: 24 })
      });

    console.log(`🎉 Sentiment analysis complete. Created ${cardsCreated} cards`);

    return new Response(JSON.stringify({
      success: true,
      content_analyzed: allContent.length,
      articles_analyzed: articles?.length || 0,
      stories_analyzed: publishedStories?.length || 0,
      keywords_found: keywordAnalysis.length,
      cards_created: cardsCreated,
      message: `Analysis complete. ${cardsCreated} sentiment cards created from ${allContent.length} content items.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Sentiment detection error:', error);
    return new Response(JSON.stringify({ 
      error: 'Sentiment detection failed', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function analyzeKeywordsAndSentiment(
  articles: ArticleData[], 
  topicKeywords: string[], 
  excludedKeywords: string[],
  apiKey: string
): Promise<KeywordAnalysis[]> {
  
  // Combine article content for analysis
  const articleTexts = articles.map(a => `${a.title} ${a.body?.substring(0, 500) || ''}`).join('\n\n');
  
  console.log('🤖 Sending keyword extraction request to DeepSeek');
  
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a news sentiment analyst. Extract trending keywords/phrases from news articles, excluding these words: ${excludedKeywords.join(', ')}. 
          Focus on topics, events, people, organizations, and policy issues that appear frequently.
          
          Return a JSON array of trending keywords with this structure:
          [
            {
              "phrase": "keyword or phrase",
              "frequency": number_of_mentions,
              "sentiment_context": ["example quote showing sentiment", "another quote"],
              "overall_sentiment": "positive/negative/neutral"
            }
          ]
          
          Only include phrases mentioned 3+ times. Exclude common words and the provided excluded keywords.`
        },
        {
          role: 'user',
          content: `Analyze these recent news articles and identify trending keywords/phrases:\n\n${articleTexts.substring(0, 8000)}`
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 1000
    }),
  });

  const data = await response.json();
  
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('No response from DeepSeek API');
  }

  try {
    const keywords = JSON.parse(data.choices[0].message.content);
    
    // Map to our structure and add source information
    return keywords.map((kw: any) => ({
      phrase: kw.phrase,
      frequency: kw.frequency,
      sentiment_context: kw.sentiment_context || [],
      sources: articles
        .filter(article => 
          article.title.toLowerCase().includes(kw.phrase.toLowerCase()) ||
          article.body?.toLowerCase().includes(kw.phrase.toLowerCase())
        )
        .slice(0, 5) // Limit to 5 sources per keyword
        .map(article => ({
          url: article.source_url,
          title: article.title,
          date: article.published_at,
          author: article.author
        }))
    }));
    
  } catch (parseError) {
    console.error('Failed to parse DeepSeek response:', parseError);
    return [];
  }
}

async function generateSentimentCard(
  analysis: KeywordAnalysis,
  topicName: string,
  apiKey: string
): Promise<{
  content: any;
  sentiment_score: number;
  confidence_score: number;
  card_type: string;
} | null> {
  
  console.log(`🎨 Generating sentiment card for: ${analysis.phrase}`);
  
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `Create a concise sentiment summary card about a trending topic. Include:
          1. A brief, engaging headline
          2. Key statistics (frequency, trend direction)
          3. 1-2 compelling quotes from sources
          4. External sentiment from Reddit/forums (simulate realistic data)
          5. Simple sentiment analysis
          
          Return JSON:
          {
            "headline": "Brief engaging title",
            "statistics": "X mentions this week, trending positive",
            "key_quote": "Most compelling quote from sources",
            "external_sentiment": "Reddit users are 60% supportive of this development",
            "summary": "2-3 sentence overview",
            "sentiment_score": number from -100 to 100,
            "confidence": number from 0 to 100
          }
          
          Keep it concise and factual. Focus on public interest angles.`
        },
        {
          role: 'user',
          content: `Topic: ${topicName}
          Keyword: ${analysis.phrase}
          Mentions: ${analysis.frequency}
          Context quotes: ${analysis.sentiment_context.join(' | ')}
          
          Create a sentiment card for this trending topic.`
        }
      ],
      temperature: 0.4,
      max_completion_tokens: 400
    }),
  });

  const data = await response.json();
  
  if (!data.choices?.[0]?.message?.content) {
    return null;
  }

  try {
    const cardData = JSON.parse(data.choices[0].message.content);
    
    return {
      content: {
        headline: cardData.headline,
        statistics: cardData.statistics,
        key_quote: cardData.key_quote,
        external_sentiment: cardData.external_sentiment,
        summary: cardData.summary
      },
      sentiment_score: cardData.sentiment_score || 0,
      confidence_score: cardData.confidence || 75,
      card_type: analysis.frequency > 5 ? 'trend' : 'quote'
    };
    
  } catch (parseError) {
    console.error('Failed to parse sentiment card response:', parseError);
    return null;
  }
}