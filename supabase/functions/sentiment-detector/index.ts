import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ArticleData {
  title: string;
  body: string;
  author?: string;
  published_at?: string;
  source_url: string;
  regional_relevance_score?: number;
}

interface KeywordAnalysis {
  phrase: string;
  frequency: number;
  sentiment_context: {
    positive: number;
    negative: number;
    neutral: number;
  };
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const deepSeekApiKey = Deno.env.get('DEEPSEEK_API_KEY');

    if (!deepSeekApiKey) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topic_id: topicId, force_analysis = false } = await req.json();

    if (!topicId) {
      throw new Error('topic_id is required');
    }

    console.log('Starting sentiment analysis for topic:', topicId);

    // Get topic settings and configuration
    const { data: topicSettings, error: settingsError } = await supabase
      .from('topic_sentiment_settings')
      .select('*')
      .eq('topic_id', topicId)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Error fetching sentiment settings:', settingsError);
      throw settingsError;
    }

    // Check if analysis should run
    if (!topicSettings?.enabled && !force_analysis) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Sentiment analysis not enabled for this topic' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get topic info and configuration
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError) {
      console.error('Error fetching topic:', topicError);
      throw topicError;
    }

    const topicName = topic.name;
    const topicKeywords = topic.keywords || [];
    const excludedKeywords = topicSettings?.excluded_keywords || [];

    console.log('Fetching published stories for topic:', topicId);
    
    // Only get published, ready stories with high regional relevance (like the topic feed)
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        *,
        slides (
          content,
          slide_number
        ),
        articles!inner (
          topic_id,
          title,
          body,
          author,
          published_at,
          source_url,
          regional_relevance_score,
          processing_status
        )
      `)
      .eq('articles.topic_id', topicId)
      .eq('is_published', true)
      .eq('status', 'ready')
      .eq('articles.processing_status', 'processed')
      .gte('articles.regional_relevance_score', topicSettings?.region ? 25 : 0)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (storiesError) {
      console.error('Error fetching published stories:', storiesError);
      throw storiesError;
    }

    // Use only published story content for analysis
    const contentForAnalysis = stories.map(story => ({
      title: story.articles.title,
      body: story.articles.body,
      author: story.articles.author,
      published_at: story.articles.published_at,
      source_url: story.articles.source_url,
      regional_relevance_score: story.articles.regional_relevance_score,
      slides: story.slides
    }));

    if (contentForAnalysis.length === 0) {
      console.log('No published content found for analysis');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No published content available for sentiment analysis',
          topicId 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${contentForAnalysis.length} published stories`);

    // Create content fingerprint for duplicate detection
    const contentFingerprint = contentForAnalysis
      .map(c => `${c.title}-${c.published_at}`)
      .sort()
      .join('|');

    // Analyze keywords and sentiment with enhanced regional focus
    const keywordAnalysis = await analyzeKeywordsAndSentiment(
      contentForAnalysis,
      topicKeywords,
      excludedKeywords,
      deepSeekApiKey,
      topicName,
      topic
    );

    console.log(`Found ${keywordAnalysis.length} trending keywords`);

    let generatedCards = 0;

    // Generate sentiment cards for keywords with frequency >= 3
    for (const keyword of keywordAnalysis) {
      if (keyword.frequency >= 3) {
        console.log(`Checking if sentiment card needed for: ${keyword.phrase}`);
        
        // Check for existing cards in the last 7 days
        const { data: existingCards, error: checkError } = await supabase
          .from('sentiment_cards')
          .select('*')
          .eq('topic_id', topicId)
          .eq('keyword_phrase', keyword.phrase)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (checkError) {
          console.error('Error checking existing cards:', checkError);
          continue;
        }

        // Calculate estimated sentiment score for comparison
        const estimatedScore = Math.round((keyword.sentiment_context.positive / Math.max(keyword.frequency, 1)) * 100);
        
        let shouldCreateCard = true;
        let updateReason = 'new_analysis';

        if (existingCards && existingCards.length > 0) {
          const existingCard = existingCards[0];
          const scoreDifference = Math.abs(estimatedScore - (existingCard.sentiment_score || 0));
          
          // Only create new card if significant change or new content
          if (scoreDifference < 15 && existingCard.content_fingerprint === contentFingerprint) {
            console.log(`Skipping duplicate card for ${keyword.phrase} - no significant change`);
            shouldCreateCard = false;
          } else if (scoreDifference >= 15) {
            updateReason = 'sentiment_shift';
          } else if (existingCard.content_fingerprint !== contentFingerprint) {
            updateReason = 'new_content';
          }
        }

        if (shouldCreateCard) {
          console.log(`Generating sentiment card for: ${keyword.phrase} (${updateReason})`);
          
          const sentimentCard = await generateSentimentCard(
            keyword,
            topicName,
            deepSeekApiKey,
            topic
          );

          if (sentimentCard) {
            // Insert the sentiment card with duplicate prevention
            const { error: insertError } = await supabase
              .from('sentiment_cards')
              .insert({
                topic_id: topicId,
                keyword_phrase: keyword.phrase,
                content: sentimentCard.content,
                sources: keyword.sources,
                sentiment_score: sentimentCard.sentiment_score,
                confidence_score: sentimentCard.confidence_score,
                card_type: sentimentCard.card_type,
                slides: sentimentCard.slides || [],
                analysis_date: new Date().toISOString().split('T')[0],
                content_fingerprint: contentFingerprint,
                previous_sentiment_score: existingCards?.[0]?.sentiment_score || 0,
                update_reason: updateReason
              });

            if (insertError) {
              if (insertError.code === '23505') { // Unique constraint violation
                console.log(`Sentiment card already exists for ${keyword.phrase} today`);
              } else {
                console.error('Error inserting sentiment card:', insertError);
              }
            } else {
              generatedCards++;
              console.log(`Successfully created sentiment card for: ${keyword.phrase}`);
            }
          }
        }
      }
    }

    // Update last analysis timestamp
    await supabase
      .from('topic_sentiment_settings')
      .upsert({
        topic_id: topicId,
        enabled: true,
        last_analysis_at: new Date().toISOString(),
        ...(topicSettings ? {} : { analysis_frequency_hours: 24 })
      });

    return new Response(
      JSON.stringify({
        success: true,
        topic_id: topicId,
        stories_analyzed: contentForAnalysis.length,
        keywords_identified: keywordAnalysis.length,
        cards_generated: generatedCards,
        content_fingerprint: contentFingerprint
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in sentiment analysis:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Analyze keywords and sentiment using DeepSeek
async function analyzeKeywordsAndSentiment(
  articles: any[],
  topicKeywords: string[],
  excludedKeywords: string[],
  apiKey: string,
  topicName?: string,
  topicConfig?: any
): Promise<KeywordAnalysis[]> {
  
  // Combine all content including slides
  const combinedContent = articles.map(article => {
    const slideContent = article.slides?.map((s: any) => s.content).join(' ') || '';
    return `${article.title} ${article.body || ''} ${slideContent}`;
  }).join('\n\n');

  // Enhanced prompt with regional focus
  const regionalContext = topicConfig ? `
Regional Focus: ${topicName}
Key Locations: ${topicConfig.landmarks?.join(', ') || 'N/A'}
Local Organizations: ${topicConfig.organizations?.join(', ') || 'N/A'}
Postcodes/Areas: ${topicConfig.postcodes?.join(', ') || 'N/A'}
` : '';

  const prompt = `Analyze the following published news content and extract trending keywords/phrases that are generating discussion. This is for the "${topicName}" topic - heavily prioritize terms related to this specific area and community.

${regionalContext}

Topic Keywords: ${topicKeywords.join(', ')}
Excluded Keywords: ${excludedKeywords.join(', ')} (ignore these completely)

CRITICAL: Only extract keywords that are directly relevant to ${topicName}. Reject any terms about other cities, regions, or places outside this area. Focus on:
- Local people, businesses, and organizations
- Local events and developments  
- Area-specific issues and concerns
- Local landmarks and places
- Community discussions and sentiment

Content to analyze:
${combinedContent}

Extract 5-10 trending keywords or phrases and for each provide:
1. The exact phrase (must be relevant to ${topicName})
2. How many times it appears or is referenced
3. Sentiment context (positive mentions, negative mentions, neutral mentions)
4. Key sources mentioning it

Return as JSON array with this structure:
[{
  "phrase": "exact keyword or phrase",
  "frequency": number,
  "sentiment_context": {
    "positive": number,
    "negative": number, 
    "neutral": number
  },
  "sources": [{"url": "source_url", "title": "article_title", "date": "date", "author": "author_name"}]
}]

REJECT any phrases about other locations outside ${topicName}. Only include locally relevant terms.`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a local news sentiment analyst specializing in regional content analysis.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 1000
      }),
    });

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('No response from DeepSeek API');
    }

    // Clean the response content to remove markdown code blocks
    let content = data.choices[0].message.content.trim();
    content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    const keywords = JSON.parse(content);
    
    // Map to our structure and add source information
    return keywords.map((kw: any) => ({
      phrase: kw.phrase,
      frequency: kw.frequency,
      sentiment_context: kw.sentiment_context || { positive: 0, negative: 0, neutral: 0 },
      sources: articles
        .filter(article => 
          article.title.toLowerCase().includes(kw.phrase.toLowerCase()) ||
          article.body?.toLowerCase().includes(kw.phrase.toLowerCase())
        )
        .slice(0, 5)
        .map(article => ({
          url: article.source_url,
          title: article.title,
          date: article.published_at,
          author: article.author
        }))
    }));
    
  } catch (parseError) {
    console.error('Failed to analyze keywords:', parseError);
    return [];
  }
}

// Generate sentiment card content using DeepSeek
async function generateSentimentCard(
  keywordData: KeywordAnalysis,
  topicName: string,
  apiKey: string,
  topicConfig?: any
): Promise<any | null> {
  
  const regionalContext = topicConfig ? `
Focus on: ${topicName}
Key Locations: ${topicConfig.landmarks?.join(', ') || 'N/A'}
Local Organizations: ${topicConfig.organizations?.join(', ') || 'N/A'}
` : '';

  const prompt = `Create a concise sentiment summary card for the trending topic "${keywordData.phrase}" in ${topicName}.

${regionalContext}

Based on this data:
- Frequency: ${keywordData.frequency} mentions
- Positive sentiment: ${keywordData.sentiment_context.positive}
- Negative sentiment: ${keywordData.sentiment_context.negative}
- Neutral sentiment: ${keywordData.sentiment_context.neutral}
- Sources: ${keywordData.sources.length} articles

CRITICAL: This card must be specifically about ${topicName}. Do not include content about other locations or regions.

Create a sentiment card with:
1. A compelling headline focused on ${topicName} (max 60 chars)
2. Key statistics about mentions/sentiment in this area
3. A representative quote from local sources if available
4. Brief summary of the local sentiment trend
5. External sentiment from local forums/social media if relevant

Return as JSON:
{
  "content": {
    "headline": "Brief compelling headline about ${topicName}",
    "statistics": "X mentions, Y% positive sentiment in ${topicName}",
    "key_quote": "Most relevant quote from local sources",
    "external_sentiment": "Local social media/forum insights if available",
    "summary": "2-3 sentence summary of the trend in ${topicName}"
  },
  "sentiment_score": 0-100,
  "confidence_score": 0-100,
  "card_type": "trend|controversy|development|community"
}`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a local news analyst creating sentiment cards for regional communities.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_completion_tokens: 400
      }),
    });

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      return null;
    }

    // Clean the response content to remove markdown code blocks
    let content = data.choices[0].message.content.trim();
    content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    const cardData = JSON.parse(content);
    
    return {
      content: cardData.content,
      sentiment_score: cardData.sentiment_score || 0,
      confidence_score: cardData.confidence_score || 75,
      card_type: cardData.card_type || 'trend',
      slides: []
    };
    
  } catch (parseError) {
    console.error('Failed to generate sentiment card:', parseError);
    return null;
  }
}