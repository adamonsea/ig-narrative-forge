import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ArticleData {
  id: string;
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

    // Load topic keywords to filter against
    const topicKeywords = topic?.keywords || [];
    console.log(`🔑 Topic has ${topicKeywords.length} existing keywords to filter against`);

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
          id: ta.id,
          title: content.title || '',
          body: content.body || '',
          author: content.author,
          published_at: content.published_at,
          source_url: content.url || ''
        };
      })
      .filter((a): a is ArticleData => a !== null && Boolean(a.title && a.body));

    console.log(`✅ Mapped ${articles.length} valid articles for analysis`);

    const splitKeywords = await analyzeSplitSentiment(articles, topic.name, excludedKeywords, topicKeywords);

    await supabase.from('sentiment_keyword_tracking').delete().eq('topic_id', topicId);

    const insertData = splitKeywords.map(kw => ({
      topic_id: topicId, keyword_phrase: kw.phrase, sentiment_direction: kw.sentiment_direction, total_mentions: kw.mention_count,
      positive_mentions: kw.sentiment_direction === 'positive' ? kw.mention_count : 0, negative_mentions: kw.sentiment_direction === 'negative' ? kw.mention_count : 0,
      neutral_mentions: 0, sentiment_ratio: kw.sentiment_direction === 'positive' ? 1.0 : -1.0, source_count: kw.sources.length, tracked_for_cards: false,
      source_urls: kw.sources.map(s => s.url)
    }));

    if (insertData.length > 0) {
      console.log(`💾 Attempting to insert ${insertData.length} keywords...`);
      const { data, error } = await supabase.from('sentiment_keyword_tracking').insert(insertData);
      
      if (error) {
        console.error('❌ Insert failed:', error);
        throw error;
      }
      console.log(`✅ Successfully inserted ${insertData.length} keywords`);
    }

    await supabase.from('topic_sentiment_settings').update({ last_run_at: new Date().toISOString() }).eq('topic_id', topicId);
    await supabase.rpc('snapshot_sentiment_keywords');

    return new Response(JSON.stringify({ success: true, keywords_found: splitKeywords.length, articles_analyzed: articles.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Common stop words to filter out generic terms
const COMMON_STOP_WORDS = new Set([
  'said', 'told', 'been', 'have', 'will', 'would', 'could', 'should',
  'from', 'with', 'about', 'after', 'their', 'were', 'they', 'this',
  'that', 'which', 'when', 'where', 'what', 'being', 'than',
  'more', 'most', 'also', 'very', 'just', 'only', 'over', 'such',
  'some', 'into', 'them', 'then', 'these', 'those', 'people', 'make',
  'made', 'year', 'years', 'time', 'work', 'first', 'last', 'long',
  'good', 'well', 'back', 'through', 'much', 'before', 'must', 'under',
  // Expanded generic terms that commonly slip through as "keywords"
  'today','tonight','yesterday','tomorrow','morning','afternoon','evening',
  'breaking','update','live','news','report','story','article','video','photo',
  'uk','england','britain','british','local','area','city','town','county','borough',
  'council','councils','school','schools','college','university','hospital','hospitals',
  'police','officers','road','roads','street','streets','traffic','service','services',
  'public','residents','resident','community','people','families','children','parents'
]);

// Months, days, seasons and other date-like words to drop
const DATE_TIME_STOP = new Set([
  'january','february','march','april','may','june','july','august','september','october','november','december',
  'jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec',
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
  'mon','tue','wed','thu','thur','fri','sat','sun',
  'spring','summer','autumn','fall','winter'
]);

// Other generic news/editorial vocabulary to exclude
const GENERIC_NEWS_STOP = new Set([
  'editor','editorial','comment','opinion','letters','subscribe','newsletter','advertisement','sponsored',
  'copyright','privacy','terms','cookie','cookies','homepage',
  'datasets','dataset','analysis','analyst','survey','reporting','media',
  // Local/governmental generic terms
  'meeting','meetings','planning','planner','planners','committee','committees',
  'councillor','councillors','councilor','councilors','member','members','officer','officers',
  'policy','policies','strategy','strategies','scheme','schemes','project','projects',
  // Fundraising and appeals
  'appeal','appeals','fundraiser','fundraisers','fundraising','charity','charities','donation','donations',
  // Transport and services (generic)
  'service','services','parking','motorist','motorists','driver','drivers','bus','buses','train','trains',
  // Weather and utilities (generic)
  'weather','storm','storms','rain','flood','floods','power','energy',
]);

async function analyzeSplitSentiment(
  articles: ArticleData[], 
  topicName: string, 
  excludedKeywords: string[],
  topicKeywords: string[]
): Promise<KeywordAnalysis[]> {
  // Combine all exclusion terms
  const allExcludedTerms = new Set([
    ...excludedKeywords.map(k => k.toLowerCase()),
    ...topicKeywords.map(k => k.toLowerCase()),
    topicName.toLowerCase()
  ]);
  const keywordMap = new Map();
  
  for (const article of articles) {
    const fullText = `${article.title} ${article.body} ${article.slides?.map(s => s.content).join(' ') || ''}`;
    const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    for (const sentence of sentences) {
      // Extract SINGLE WORDS from each sentence
      const words = sentence.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => {
          // Must be 5+ characters (stricter to avoid generic short words)
          if (word.length < 5) return false;

          // Letters only (no digits or mixed tokens)
          if (!/^[a-z]+$/.test(word)) return false;

          // Exclude common, date/time, and generic news words
          if (COMMON_STOP_WORDS.has(word) || DATE_TIME_STOP.has(word) || GENERIC_NEWS_STOP.has(word)) return false;

          // Not already in topic keywords or excluded terms
          if (allExcludedTerms.has(word)) return false;

          // Check if word is part of any multi-word excluded term
          if (Array.from(allExcludedTerms).some(term => term.includes(word) || word.includes(term))) return false;

          return true;
        });

      for (const word of words) {
        const sentiment = analyzeSentimentInContext(sentence, word);
        if (sentiment === 'neutral') continue;
        
        if (!keywordMap.has(word)) {
          keywordMap.set(word, {
              articles: new Map(),
              sources: new Set(),
              positiveContexts: [], 
              negativeContexts: [] 
          });
        }
        
        const data = keywordMap.get(word);
          
          // Extract domain from URL
          let domain = 'unknown';
          try {
            domain = new URL(article.source_url).hostname;
          } catch (e) {
            domain = article.source_url;
          }
          
          // Track by article ID and sentiment
          const articleKey = `${article.id}_${sentiment}`;
          if (!data.articles.has(articleKey)) {
            data.articles.set(articleKey, {
              id: article.id,
              url: article.source_url,
              title: article.title,
              date: article.published_at || new Date().toISOString(),
              author: article.author,
              prominence: 1,
              sentiment: sentiment
            });
            data.sources.add(domain);
            
            const targetContexts = sentiment === 'positive' 
              ? data.positiveContexts 
              : data.negativeContexts;
            targetContexts.push(sentence.trim());
        } else {
          data.articles.get(articleKey).prominence += 1;
        }
      }
    }
  }
  
  console.log(`📊 Extracted ${keywordMap.size} unique single-word keywords after filtering`);
  const results: KeywordAnalysis[] = [];
  for (const [keyword, data] of keywordMap) {
    // Count articles by sentiment
    const negativeArticles = Array.from(data.articles.values())
      .filter(a => a.sentiment === 'negative');
    const positiveArticles = Array.from(data.articles.values())
      .filter(a => a.sentiment === 'positive');

    // If a word appears across too many articles, it's likely generic – drop it
    const uniqueDocCount = new Set(Array.from(data.articles.values()).map((a: any) => a.id)).size;
    const docShare = uniqueDocCount / Math.max(1, articles.length);
    if (docShare > 0.3) {
      continue;
    }
    
    // Require: 4+ different articles AND 3+ different source domains
    if (negativeArticles.length >= 4 && data.sources.size >= 3) {
      results.push({
        phrase: keyword,
        sentiment_direction: 'negative',
        mention_count: negativeArticles.length,
        sources: negativeArticles
          .map(a => ({
            url: a.url,
            title: a.title,
            date: a.date,
            author: a.author,
            prominence: a.prominence
          }))
          .sort((a, b) => b.prominence - a.prominence)
          .slice(0, 10),
        prominent_phrases: []
      });
    }
    
    if (positiveArticles.length >= 4 && data.sources.size >= 3) {
      results.push({
        phrase: keyword,
        sentiment_direction: 'positive',
        mention_count: positiveArticles.length,
        sources: positiveArticles
          .map(a => ({
            url: a.url,
            title: a.title,
            date: a.date,
            author: a.author,
            prominence: a.prominence
          }))
          .sort((a, b) => b.prominence - a.prominence)
          .slice(0, 10),
        prominent_phrases: []
      });
    }
  }
  
  console.log(`📊 Keyword analysis: ${keywordMap.size} unique phrases found`);
  console.log(`✅ Keywords meeting threshold (3+ articles, 2+ sources): ${results.length}`);
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
