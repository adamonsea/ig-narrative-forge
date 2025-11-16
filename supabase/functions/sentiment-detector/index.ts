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
  slides?: Array<{ content: string }>;
}

interface KeywordAnalysis {
  phrase: string;
  sentiment_direction: 'positive' | 'negative';
  mention_count: number;
  sources: Array<{
    url: string;
    title: string;
    date: string;
    author?: string;
    prominence: number;
  }>;
  prominent_phrases: string[];
}

const STRONG_NEGATIVE = ['crisis', 'disaster', 'scandal', 'corruption', 'abuse', 'fraud', 'fatal', 'death', 'killed', 'murder', 'violence', 'assault', 'catastrophe', 'devastation'];
const NEGATIVE = ['concern', 'worry', 'problem', 'issue', 'risk', 'danger', 'threat', 'accident', 'injury', 'damage', 'loss', 'failure', 'delay', 'criticism', 'oppose', 'reject', 'deny', 'refuse', 'cancel', 'close', 'cut', 'reduce', 'decline', 'fall', 'drop', 'struggle', 'suffer', 'complaint', 'protest'];
const STRONG_POSITIVE = ['excellence', 'triumph', 'breakthrough', 'revolutionary', 'spectacular', 'outstanding', 'remarkable', 'exceptional', 'brilliant', 'magnificent', 'wonderful', 'fantastic'];
const POSITIVE = ['success', 'achievement', 'win', 'victory', 'improve', 'growth', 'progress', 'benefit', 'gain', 'increase', 'rise', 'boost', 'support', 'approve', 'praise', 'celebrate', 'honor', 'award', 'launch', 'open', 'expand', 'innovation', 'opportunity', 'community'];

serve(async (req) => {
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

    if (!topicId) throw new Error('topic_id is required');

    const { data: topicSettings } = await supabase.from('topic_sentiment_settings').select('*').eq('topic_id', topicId).single();
    if (!topicSettings?.enabled && !force_analysis) {
      return new Response(JSON.stringify({ success: false, message: 'Sentiment analysis not enabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: topic } = await supabase.from('topics').select('*').eq('id', topicId).single();
    if (!topic) throw new Error('Topic not found');

    const excludedKeywords = topicSettings?.excluded_keywords || [];

    // Fetch topic articles with shared content
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log(`📊 Fetching articles for topic ${topicId} since ${thirtyDaysAgo}`);

    const { data: topicArticles, error: fetchError } = await supabase
      .from('topic_articles')
      .select(`
        id,
        shared_article_content (
          title,
          body,
          author,
          published_at,
          url
        )
      `)
      .eq('topic_id', topicId)
      .eq('status', 'processed')
      .gte('created_at', thirtyDaysAgo)
      .limit(100);

    if (fetchError) {
      console.error('❌ Error fetching articles:', fetchError);
      throw fetchError;
    }

    console.log(`📊 Found ${topicArticles?.length || 0} processed articles`);

    const articles: ArticleData[] = (topicArticles || [])
      .map(ta => {
        const content = ta.shared_article_content;
        if (!content) return null;
        
        return {
          title: content.title || '',
          body: content.body || '',
          author: content.author,
          published_at: content.published_at,
          source_url: content.url || ''
        };
      })
      .filter((a): a is ArticleData => a !== null && Boolean(a.title && a.body));

    console.log(`✅ Mapped ${articles.length} valid articles for analysis`);

    const splitKeywords = await analyzeSplitSentiment(articles, topic.name, excludedKeywords);

    await supabase.from('sentiment_keyword_tracking').delete().eq('topic_id', topicId);

    const insertData = splitKeywords.map(kw => ({
      topic_id: topicId, keyword_phrase: kw.phrase, sentiment_direction: kw.sentiment_direction, total_mentions: kw.mention_count,
      positive_mentions: kw.sentiment_direction === 'positive' ? kw.mention_count : 0, negative_mentions: kw.sentiment_direction === 'negative' ? kw.mention_count : 0,
      neutral_mentions: 0, sentiment_ratio: kw.sentiment_direction === 'positive' ? 1.0 : -1.0, source_count: kw.sources.length, tracked_for_cards: false,
      sources: kw.sources, prominent_phrases: kw.prominent_phrases
    }));

    if (insertData.length > 0) {
      await supabase.from('sentiment_keyword_tracking').insert(insertData);
    }

    await supabase.from('topic_sentiment_settings').update({ last_run_at: new Date().toISOString() }).eq('topic_id', topicId);
    await supabase.rpc('snapshot_sentiment_keywords');

    return new Response(JSON.stringify({ success: true, keywords_found: splitKeywords.length, articles_analyzed: articles.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function analyzeSplitSentiment(articles: ArticleData[], topicName: string, excludedKeywords: string[]): Promise<KeywordAnalysis[]> {
  const keywordMap = new Map();
  for (const article of articles) {
    const fullText = `${article.title} ${article.body} ${article.slides?.map(s => s.content).join(' ') || ''}`;
    const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
    for (const sentence of sentences) {
      const words = sentence.toLowerCase().split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const keywords = [
          `${words[i]} ${words[i + 1]}`.replace(/[^\w\s]/g, '').trim(),
          i < words.length - 2 ? `${words[i]} ${words[i + 1]} ${words[i + 2]}`.replace(/[^\w\s]/g, '').trim() : ''
        ].filter(k => k.length > 5 && !excludedKeywords.some(ex => k.includes(ex.toLowerCase())) && !k.includes(topicName.toLowerCase().split(' ')[0]));
        
        for (const keyword of keywords) {
          const sentiment = analyzeSentimentInContext(sentence, keyword);
          if (sentiment === 'neutral') continue;
          if (!keywordMap.has(keyword)) keywordMap.set(keyword, { positive: new Map(), negative: new Map(), positiveContexts: [], negativeContexts: [] });
          const data = keywordMap.get(keyword);
          const targetMap = sentiment === 'positive' ? data.positive : data.negative;
          const targetContexts = sentiment === 'positive' ? data.positiveContexts : data.negativeContexts;
          if (!targetMap.has(article.source_url)) {
            targetMap.set(article.source_url, { prominence: 1, title: article.title, date: article.published_at || new Date().toISOString(), author: article.author });
            targetContexts.push(sentence.trim());
          } else targetMap.get(article.source_url).prominence += 1;
        }
      }
    }
  }
  const results: KeywordAnalysis[] = [];
  for (const [keyword, data] of keywordMap) {
    if (data.negative.size >= 5) results.push({ phrase: keyword, sentiment_direction: 'negative', mention_count: data.negative.size, sources: Array.from(data.negative.entries()).map(([url, info]) => ({ url, title: info.title, date: info.date, author: info.author, prominence: info.prominence })).sort((a, b) => b.prominence - a.prominence).slice(0, 10), prominent_phrases: [] });
    if (data.positive.size >= 5) results.push({ phrase: keyword, sentiment_direction: 'positive', mention_count: data.positive.size, sources: Array.from(data.positive.entries()).map(([url, info]) => ({ url, title: info.title, date: info.date, author: info.author, prominence: info.prominence })).sort((a, b) => b.prominence - a.prominence).slice(0, 10), prominent_phrases: [] });
  }
  return results.sort((a, b) => b.mention_count - a.mention_count);
}

function analyzeSentimentInContext(text: string, keyword: string): 'positive' | 'negative' | 'neutral' {
  const lowerText = text.toLowerCase();
  const keywordPos = lowerText.indexOf(keyword.toLowerCase());
  if (keywordPos === -1) return 'neutral';
  const context = lowerText.slice(Math.max(0, keywordPos - 250), Math.min(lowerText.length, keywordPos + keyword.length + 250));
  let positiveScore = 0, negativeScore = 0;
  for (const word of STRONG_NEGATIVE) if (context.includes(word)) negativeScore += 2;
  for (const word of NEGATIVE) if (context.includes(word)) negativeScore += 1;
  for (const word of STRONG_POSITIVE) if (context.includes(word)) positiveScore += 2;
  for (const word of POSITIVE) if (context.includes(word)) positiveScore += 1;
  if (negativeScore > positiveScore && negativeScore >= 2) return 'negative';
  if (positiveScore > negativeScore && positiveScore >= 2) return 'positive';
  return 'neutral';
}
