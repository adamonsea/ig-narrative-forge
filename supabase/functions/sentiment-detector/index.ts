import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
  slides?: Array<{ content: string }>;
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

    console.log('🚀 Sentiment Detector Invoked', {
      timestamp: new Date().toISOString(),
      hasDeepSeekKey: !!deepSeekApiKey
    });

    if (!deepSeekApiKey) {
      const error = 'DEEPSEEK_API_KEY not configured - cannot proceed with sentiment analysis';
      console.error('❌', error);
      throw new Error(error);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topic_id: topicId, force_analysis = false, mode } = await req.json();

    if (!topicId) {
      throw new Error('topic_id is required');
    }

    console.log('📊 Starting sentiment analysis', {
      topicId,
      force_analysis,
      mode: mode || 'full'
    });

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

    console.log('🔍 Fetching published stories...', {
      topicId,
      lookback: '30 days'
    });
    
    // Get published stories using the existing legacy structure that we know works for Eastbourne
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
      .in('status', ['ready', 'published']) // Accept both ready and published status
      .eq('articles.processing_status', 'processed')
      .gte('articles.regional_relevance_score', 0) // Lower threshold to be more inclusive
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Extended to 30 days (1 month)
      .order('created_at', { ascending: false });

    if (storiesError) {
      console.error('❌ Error fetching published stories:', storiesError);
      throw storiesError;
    }

    console.log(`✅ Found ${stories?.length || 0} published stories`, {
      storyIds: stories?.map(s => s.id).slice(0, 5),
      hasArticles: stories?.every(s => s.articles),
      hasSlides: stories?.every(s => s.slides?.length > 0)
    });

    // Use published story content for analysis
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
      console.warn('⚠️ No published content found for analysis', {
        topicId,
        totalStoriesQueried: stories?.length || 0,
        possibleReasons: [
          'No stories with status "ready" or "published"',
          'No articles with processing_status "processed"',
          'All stories older than 30 days'
        ]
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No published content available for sentiment analysis',
          topicId,
          debug: {
            storiesQueried: stories?.length || 0,
            reason: 'No matching stories found with required status'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📝 Analyzing ${contentForAnalysis.length} published stories`, {
      titles: contentForAnalysis.slice(0, 3).map(c => c.title)
    });

    // Create content fingerprint for duplicate detection
    const contentFingerprint = contentForAnalysis
      .map(c => `${c.title}-${c.published_at}`)
      .sort()
      .join('|');

    // Analyze keywords and sentiment with enhanced regional focus
    console.log('🤖 Calling DeepSeek API for keyword analysis...');
    let keywordAnalysis = await analyzeKeywordsAndSentiment(
      contentForAnalysis,
      topicKeywords,
      excludedKeywords,
      deepSeekApiKey,
      topicName,
      topic
    );

    const fallbackKeywords = fallbackKeywordExtraction(
      contentForAnalysis,
      excludedKeywords,
      topicName
    );

    if (fallbackKeywords.length > 0) {
      const existingPhrases = new Set(keywordAnalysis.map(k => k.phrase.toLowerCase()));
      for (const fb of fallbackKeywords) {
        if (!existingPhrases.has(fb.phrase.toLowerCase())) {
          keywordAnalysis.push(fb);
        }
      }
    }

    console.log(`✨ Found ${keywordAnalysis.length} trending keywords`, {
      keywords: keywordAnalysis.map(k => k.phrase).slice(0, 5)
    });

    // Update keyword tracking table
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const existingKeywordMap = new Map<string, { tracked_for_cards: boolean }>();
    if (keywordAnalysis.length > 0) {
      const uniquePhrases = Array.from(new Set(keywordAnalysis.map(k => k.phrase)));
      const { data: existingKeywords, error: existingError } = await supabase
        .from('sentiment_keyword_tracking')
        .select('keyword_phrase, tracked_for_cards')
        .eq('topic_id', topicId)
        .in('keyword_phrase', uniquePhrases);

      if (existingError) {
        console.error('❌ Error fetching existing keyword tracking:', existingError);
      } else {
        for (const record of existingKeywords || []) {
          existingKeywordMap.set(record.keyword_phrase.toLowerCase(), {
            tracked_for_cards: record.tracked_for_cards
          });
        }
      }
    }

    for (const keyword of keywordAnalysis) {
      // Calculate trend status
      const currentTrend = keyword.frequency >= 5 ? 'sustained' : 'emerging';

      // Upsert keyword tracking
      const { error: trackingError } = await supabase
        .from('sentiment_keyword_tracking')
        .upsert({
          topic_id: topicId,
          keyword_phrase: keyword.phrase,
          last_seen_at: now.toISOString(),
          total_mentions: keyword.frequency,
          source_count: keyword.sources.length,
          current_trend: currentTrend,
          updated_at: now.toISOString(),
        }, {
          onConflict: 'topic_id,keyword_phrase',
          ignoreDuplicates: false
        });

      if (trackingError) {
        console.error('❌ Error upserting keyword tracking:', trackingError);
        continue;
      }

      if (!existingKeywordMap.has(keyword.phrase.toLowerCase())) {
        console.log(`🔔 New keyword detected: ${keyword.phrase}`);
        try {
          const estimatedNotificationScore = calculateEstimatedSentimentScore(keyword);
          await supabase.functions.invoke('send-story-notification', {
            body: {
              topicId,
              notificationType: 'sentiment',
              keywordPhrase: keyword.phrase,
              sentimentScore: estimatedNotificationScore
            }
          });
        } catch (notifyError) {
          console.error('⚠️ Failed to send sentiment notification:', notifyError);
        }
        existingKeywordMap.set(keyword.phrase.toLowerCase(), { tracked_for_cards: false });
      }
    }

    // Mark keywords not seen recently as fading
    await supabase
      .from('sentiment_keyword_tracking')
      .update({ current_trend: 'fading' })
      .eq('topic_id', topicId)
      .lt('last_seen_at', thirtyDaysAgo.toISOString());

    let generatedCards = 0;

    // Generate sentiment cards for keywords with reasonable support
    for (const keyword of keywordAnalysis) {
      if (keyword.frequency >= 2 && keyword.sources.length >= 2) {
        console.log(`🎯 Evaluating keyword for card: "${keyword.phrase}"`, {
          frequency: keyword.frequency,
          sources: keyword.sources.length,
          sentiment: keyword.sentiment_context
        });
        
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
        const estimatedScore = calculateEstimatedSentimentScore(keyword);
        
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
          console.log(`🎨 Generating sentiment card`, {
            keyword: keyword.phrase,
            reason: updateReason
          });
          
          try {
            const sentimentCard = await generateSentimentCard(
              keyword,
              topicName,
              deepSeekApiKey,
              topic
            );

            if (sentimentCard) {
              console.log(`✅ Card generated successfully for "${keyword.phrase}"`, {
                sentiment_score: sentimentCard.sentiment_score,
                confidence_score: sentimentCard.confidence_score,
                card_type: sentimentCard.card_type
              });

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
                  update_reason: updateReason,
                  is_published: true,
                  needs_review: true,
                  is_visible: true
                });

              if (insertError) {
                if (insertError.code === '23505') { // Unique constraint violation
                  console.warn(`⚠️ Duplicate card prevented for "${keyword.phrase}" (already exists today)`);
                } else {
                  console.error('❌ Error inserting sentiment card:', insertError);
                }
              } else {
                generatedCards++;
                console.log(`💾 Card saved to database for "${keyword.phrase}"`);
              }
            } else {
              console.warn(`⚠️ Card generation returned null for "${keyword.phrase}"`);
            }
          } catch (cardError) {
            console.error(`❌ Error during card generation for "${keyword.phrase}":`, cardError);
          }
        } else {
          console.log(`⏭️ Skipping card generation for "${keyword.phrase}" (no significant changes)`);
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

    // Prepare keyword suggestions (keywords that could be added to topic)
    const keywordSuggestions = keywordAnalysis
      .filter(k => k.frequency >= 2 && k.sources.length >= 2) // Match card generation threshold
      .filter(k => !topicKeywords.some((tk: any) => 
        tk.toLowerCase().includes(k.phrase.toLowerCase()) || 
        k.phrase.toLowerCase().includes(tk.toLowerCase())
      )) // Only suggest if not already in topic keywords
      .slice(0, 8) // Limit to top 8 suggestions
      .map(k => ({
        keyword: k.phrase,
        frequency: k.frequency,
        confidence: Math.min(95, Math.round((k.frequency / Math.max(contentForAnalysis.length, 1)) * 100 + 50)),
        sources_count: k.sources.length,
        sentiment_context: k.sentiment_context
      }));

    console.log('🎉 Analysis complete!', {
      stories_analyzed: contentForAnalysis.length,
      keywords_identified: keywordAnalysis.length,
      cards_generated: generatedCards,
      keyword_suggestions: keywordSuggestions.length
    });

    return new Response(
      JSON.stringify({
        success: true,
        topic_id: topicId,
        stories_analyzed: contentForAnalysis.length,
        keywords_identified: keywordAnalysis.length,
        cards_generated: generatedCards,
        content_fingerprint: contentFingerprint,
        keyword_suggestions: keywordSuggestions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('💥 Critical Error in sentiment analysis:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function calculateEstimatedSentimentScore(keyword: KeywordAnalysis): number {
  const positive = keyword.sentiment_context?.positive ?? 0;
  const negative = keyword.sentiment_context?.negative ?? 0;
  const denominator = Math.max(keyword.frequency || 0, 1);
  const rawScore = ((positive - negative) / denominator) * 100;
  return Math.max(-100, Math.min(100, Math.round(rawScore)));
}

function fallbackKeywordExtraction(
  articles: ArticleData[],
  excludedKeywords: string[],
  topicName?: string
): KeywordAnalysis[] {
  const excludedSet = new Set(excludedKeywords.map(k => k.toLowerCase()));
  const stopwords = new Set([
    'the', 'and', 'with', 'from', 'that', 'this', 'have', 'will', 'about', 'there', 'their', 'which',
    'after', 'before', 'would', 'could', 'should', 'these', 'those', 'into', 'local', 'community',
    'council', 'councils', 'people', 'update', 'latest', 'today', 'news'
  ]);

  if (topicName) {
    topicName.split(/\s+/).forEach(part => stopwords.add(part.toLowerCase()));
  }

  const positiveWords = new Set(['improve', 'support', 'funding', 'investment', 'win', 'approval', 'progress', 'benefit']);
  const negativeWords = new Set(['delay', 'issue', 'problem', 'concern', 'opposition', 'criticism', 'challenge', 'risk']);

  const keywordMap = new Map<string, {
    mentions: number;
    sources: Map<string, { url: string; title: string; date: string; author?: string }>;
    positive: number;
    negative: number;
  }>();

  const excludedPhrase = (phrase: string) => {
    const lower = phrase.toLowerCase();
    if (excludedSet.has(lower)) return true;
    if (stopwords.has(lower)) return true;
    const parts = lower.split(' ');
    return parts.every(part => stopwords.has(part));
  };

  for (const article of articles) {
    const slideText = article.slides?.map(slide => slide.content).join(' ') || '';
    const combinedText = `${article.title || ''}. ${article.body || ''}. ${slideText}`;
    const candidatePhrases = new Set<string>();

    const phraseRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = phraseRegex.exec(article.title || '')) !== null) {
      candidatePhrases.add(match[1].trim());
    }
    while ((match = phraseRegex.exec(article.body || '')) !== null) {
      candidatePhrases.add(match[1].trim());
    }

    if (candidatePhrases.size < 5) {
      const capitalRegex = /\b([A-Z][a-z]{3,})\b/g;
      let singleMatch: RegExpExecArray | null;
      while ((singleMatch = capitalRegex.exec(article.title || '')) !== null) {
        candidatePhrases.add(singleMatch[1]);
      }
    }

    for (const phrase of candidatePhrases) {
      const normalized = phrase.replace(/\s+/g, ' ').trim();
      if (normalized.length < 4) continue;
      if (excludedPhrase(normalized)) continue;

      const lower = normalized.toLowerCase();
      const mentionRegex = new RegExp(lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const mentions = combinedText.match(mentionRegex)?.length || 0;
      if (mentions === 0) continue;

      const sourceKey = article.source_url || `${article.title}-${article.published_at}`;
      const entry = keywordMap.get(lower) || {
        mentions: 0,
        sources: new Map<string, { url: string; title: string; date: string; author?: string }>(),
        positive: 0,
        negative: 0
      };

      entry.mentions += mentions;
      if (!entry.sources.has(sourceKey)) {
        entry.sources.set(sourceKey, {
          url: article.source_url,
          title: article.title,
          date: article.published_at || new Date().toISOString(),
          author: article.author
        });
      }

      const sentiment = collectSimpleSentiment(combinedText, lower, positiveWords, negativeWords);
      entry.positive += sentiment.positive;
      entry.negative += sentiment.negative;

      keywordMap.set(lower, entry);
    }
  }

  return Array.from(keywordMap.entries())
    .map(([phrase, info]) => ({
      phrase: phrase.replace(/\b\w/g, char => char.toUpperCase()),
      frequency: info.mentions,
      sentiment_context: {
        positive: info.positive,
        negative: info.negative,
        neutral: Math.max(info.mentions - (info.positive + info.negative), 0)
      },
      sources: Array.from(info.sources.values())
        .filter(source => !!source.title && !!source.url)
        .slice(0, 5)
    }))
    .filter(item => item.sources.length >= 1 && item.frequency >= 2)
    .slice(0, 10);
}

function collectSimpleSentiment(
  text: string,
  phraseLower: string,
  positiveWords: Set<string>,
  negativeWords: Set<string>
): { positive: number; negative: number } {
  let positive = 0;
  let negative = 0;
  const sentences = text.split(/(?<=[.!?])/);
  for (const sentence of sentences) {
    if (!sentence) continue;
    if (!sentence.toLowerCase().includes(phraseLower)) continue;
    const words = sentence.toLowerCase().split(/[^a-z0-9]+/);
    for (const word of words) {
      if (positiveWords.has(word)) positive++;
      if (negativeWords.has(word)) negative++;
    }
  }
  return { positive, negative };
}

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
- Include insights from Reddit, forums, and social media when available

Content to analyze:
${combinedContent}

Extract 5-10 trending keywords or phrases and for each provide:
1. The exact phrase (must be relevant to ${topicName})
2. How many times it appears or is referenced
3. Sentiment context (positive mentions, negative mentions, neutral mentions)
4. Key sources mentioning it (must include at least 4 sources)
5. Reddit/forum sentiment if available

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
    console.log('📡 Calling DeepSeek for keyword analysis...');
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ DeepSeek API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`DeepSeek API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      console.error('❌ Invalid DeepSeek response structure:', data);
      throw new Error('No response from DeepSeek API');
    }

    console.log('✅ DeepSeek keyword analysis successful');

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
        .map(article => {
          const titleMatch = article.title.toLowerCase().includes(kw.phrase.toLowerCase());
          const bodyLower = (article.body || '').toLowerCase();
          const phraseLower = kw.phrase.toLowerCase();
          
          // Calculate relevance score
          let relevanceScore = 0;
          if (titleMatch) relevanceScore += 10; // Strong signal if in title
          
          // Count keyword mentions in body
          const mentionCount = (bodyLower.match(new RegExp(phraseLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
          relevanceScore += Math.min(mentionCount * 2, 20); // Up to 20 points for mentions
          
          // Bonus for high regional relevance
          if (article.regional_relevance_score && article.regional_relevance_score > 70) {
            relevanceScore += 5;
          }
          
          return {
            article,
            relevanceScore
          };
        })
        .filter(item => {
          // Must meet minimum relevance threshold
          if (item.relevanceScore < 10) return false;
          
          // Must have valid publication date
          if (!item.article.published_at) return false;
          
          // Must have title
          if (!item.article.title || item.article.title.length < 10) return false;
          
          // Must have sufficient content
          if (!item.article.body || item.article.body.length < 100) return false;
          
          return true;
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore) // Sort by relevance
        .slice(0, 5) // Take top 5 most relevant
        .map(item => ({
          url: item.article.source_url,
          title: item.article.title,
          date: item.article.published_at,
          author: item.article.author
        }))
    }));
    
  } catch (parseError) {
    console.error('💥 Failed to analyze keywords:', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      stack: parseError instanceof Error ? parseError.stack : undefined
    });
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
2. Key statistics about mentions/sentiment in this area over the past week
3. A representative quote from local sources if available
4. Brief summary of the local sentiment trend over the past week
5. External sentiment from local forums/social media/Reddit if relevant

Return as JSON:
{
  "content": {
    "headline": "Brief compelling headline about ${topicName}",
    "statistics": "X mentions, Y% positive sentiment in ${topicName} this week",
    "key_quote": "Most relevant quote from local sources",
    "external_sentiment": "Local social media/forum/Reddit insights if available",
    "summary": "2-3 sentence summary of the trend in ${topicName} over the past week"
  },
  "sentiment_score": 0-100,
  "confidence_score": 0-100,
  "card_type": "trend|quote|comparison|timeline"
}`;

  try {
    console.log('📡 Calling DeepSeek for card generation...');
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ DeepSeek API error during card generation:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return null;
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      console.error('❌ Invalid DeepSeek card response structure:', data);
      return null;
    }

    console.log('✅ DeepSeek card generation successful');

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
    console.error('💥 Failed to generate sentiment card:', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      stack: parseError instanceof Error ? parseError.stack : undefined
    });
    return null;
  }
}