import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');

interface RedditPost {
  title: string;
  content: string;
  url: string;
  created: string;
  subreddit: string;
}

interface CommunityInsight {
  type: 'sentiment' | 'concern' | 'validation';
  content: string;
  confidence: number;
  metadata: any;
}

serve(async (req) => {
  console.log('🚀 reddit-community-processor INITIALIZED - Function started');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🏘️ Starting CAREFUL Reddit community processing...');
    console.log('🔑 DeepSeek API Key present:', !!deepseekApiKey);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body to get specific topic IDs
    const { topic_ids } = await req.json().catch(() => ({}));
    
    if (!topic_ids || !Array.isArray(topic_ids) || topic_ids.length === 0) {
      throw new Error('topic_ids array required - processor must be told which topics to process');
    }
    
    console.log(`📋 Processing ${topic_ids.length} specific topics:`, topic_ids);
    
    // Get ONLY the topics passed in the request
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, region, topic_type, community_config, community_intelligence_enabled')
      .in('id', topic_ids)
      .eq('community_intelligence_enabled', true);

    if (topicsError) {
      console.error('Error fetching topics:', topicsError);
      throw topicsError;
    }

    if (!topics || topics.length === 0) {
      console.log('✅ No topics with community intelligence enabled');
      return new Response(
        JSON.stringify({ success: true, message: 'No topics to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Processing ${topics.length} topics with community intelligence`);
    
    const results = [];
    
    // Process each topic very carefully with delays
    for (const topic of topics) {
      try {
        console.log(`🔍 Processing topic: ${topic.name} (${topic.topic_type})`);
        
        // Use tenant-configured subreddits from community_config
        const configuredSubreddits = topic.community_config?.subreddits || [];
        const subreddits = configuredSubreddits
          .map((s: string) => s.trim().toLowerCase().replace(/^r\//, ''))
          .filter((s: string) => s.length > 0)
          .slice(0, 2); // Limit to 2 for respectful rate limiting
        
        if (subreddits.length === 0) {
          console.log(`⚠️ No subreddits configured for ${topic.name}, skipping topic`);
          results.push({
            topic_id: topic.id,
            topic_name: topic.name,
            status: 'skipped',
            reason: 'No subreddits configured'
          });
          continue;
        }
        
        console.log(`📡 Using ${subreddits.length} configured subreddits for ${topic.name}:`, subreddits);
        
        // Process each subreddit carefully (max 2 per topic)
        const limitedSubreddits = subreddits.slice(0, 2);
        
        for (const subreddit of limitedSubreddits) {
          try {
            console.log(`📥 Fetching RSS for r/${subreddit}...`);
            
            // Fetch Reddit RSS with careful rate limiting
            const posts = await fetchRedditRSS(subreddit);
            
            if (posts.length > 0) {
              console.log(`📝 Processing ${posts.length} posts from r/${subreddit}`);
              
              // Analyze with DeepSeek (if available)
              if (deepseekApiKey) {
                const insights = await analyzeWithDeepSeek(posts, topic, supabase);
                
                // Store insights in database
                if (insights.length > 0) {
                  await storeInsights(supabase, topic.id, subreddit, insights);
                  console.log(`💾 Stored ${insights.length} insights for ${topic.name}`);
                }
              }
            }
            
            // Respectful delay between subreddit requests (10-15 seconds)
            console.log('⏳ Waiting 12 seconds before next subreddit...');
            await new Promise(resolve => setTimeout(resolve, 12000));
            
          } catch (subredditError) {
            console.error(`Error processing r/${subreddit}:`, subredditError);
            // Continue with next subreddit on error
            continue;
          }
        }
        
        // Update topic's last processed time
        await supabase
          .from('topics')
          .update({
            community_config: {
              ...topic.community_config,
              last_processed: new Date().toISOString(),
              subreddits: limitedSubreddits
            }
          })
          .eq('id', topic.id);
        
        results.push({
          topic_id: topic.id,
          topic_name: topic.name,
          subreddits_processed: limitedSubreddits.length,
          status: 'completed'
        });
        
        // Respectful delay between topics (15-20 seconds)
        console.log('⏳ Waiting 18 seconds before next topic...');
        await new Promise(resolve => setTimeout(resolve, 18000));
        
      } catch (topicError) {
        console.error(`Error processing topic ${topic.name}:`, topicError);
        results.push({
          topic_id: topic.id,
          topic_name: topic.name,
          status: 'error',
          error: topicError instanceof Error ? topicError.message : String(topicError)
        });
        continue;
      }
    }

    console.log('✅ Reddit community processing completed');
    
    return new Response(
      JSON.stringify({
        success: true,
        topics_processed: results.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in reddit-community-processor:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Legacy function removed - now using tenant-configured subreddits from community_config

// PHASE 1-4: Robust RSS Fetching with Multiple Strategies
async function fetchRedditRSS(subreddit: string): Promise<RedditPost[]> {
  console.log(`🔄 Starting multi-strategy RSS fetch for r/${subreddit}`);
  
  // Strategy 1: Standard RSS with new sort
  let posts = await tryRSSEndpoint(subreddit, '.rss?sort=new&limit=25');
  if (posts.length > 0) {
    console.log(`✅ Strategy 1 (RSS new) succeeded: ${posts.length} posts`);
    return posts;
  }
  
  // Strategy 2: Standard RSS without params
  posts = await tryRSSEndpoint(subreddit, '.rss?limit=25');
  if (posts.length > 0) {
    console.log(`✅ Strategy 2 (RSS default) succeeded: ${posts.length} posts`);
    return posts;
  }
  
  // Strategy 3: Hot sort RSS
  posts = await tryRSSEndpoint(subreddit, '.rss?sort=hot&limit=25');
  if (posts.length > 0) {
    console.log(`✅ Strategy 3 (RSS hot) succeeded: ${posts.length} posts`);
    return posts;
  }
  
  // Strategy 4: Fallback to HTML scraping (old.reddit.com)
  console.log(`⚠️ All RSS strategies failed, trying HTML scraping fallback...`);
  posts = await scrapeRedditHTML(subreddit);
  if (posts.length > 0) {
    console.log(`✅ Strategy 4 (HTML scrape) succeeded: ${posts.length} posts`);
    return posts;
  }
  
  console.warn(`❌ All strategies failed for r/${subreddit}`);
  return [];
}

// Try a specific RSS endpoint with enhanced parsing
async function tryRSSEndpoint(subreddit: string, endpoint: string): Promise<RedditPost[]> {
  try {
    const rssUrl = `https://www.reddit.com/r/${subreddit}${endpoint}`;
    
    // Enhanced User-Agent rotation (more realistic)
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];
    
    const randomAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    console.log(`📡 Fetching: ${rssUrl}`);
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': randomAgent,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      signal: AbortSignal.timeout(30000)
    });
    
    console.log(`📊 Response: ${response.status} ${response.statusText}`);
    console.log(`📋 Content-Type: ${response.headers.get('content-type')}`);
    
    if (!response.ok) {
      console.warn(`❌ HTTP ${response.status} for ${rssUrl}`);
      return [];
    }
    
    const xmlText = await response.text();
    console.log(`📄 Response length: ${xmlText.length} chars`);
    
    // DIAGNOSTIC: Log XML structure when no posts found
    if (xmlText.length < 500) {
      console.log(`⚠️ Small response detected. First 500 chars:\n${xmlText.substring(0, 500)}`);
    } else {
      console.log(`📝 XML preview (first 1000 chars):\n${xmlText.substring(0, 1000)}`);
    }
    
    // PHASE 2: Multi-format parsing with fallbacks
    let posts = parseRSSFormat(xmlText, subreddit);
    if (posts.length > 0) return posts;
    
    posts = parseAtomFormat(xmlText, subreddit);
    if (posts.length > 0) return posts;
    
    console.log(`⚠️ No posts extracted from ${xmlText.length} chars of XML`);
    return [];
    
  } catch (error) {
    console.warn(`❌ Error fetching ${endpoint}:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

// Parse RSS 2.0 format with namespace handling
function parseRSSFormat(xmlText: string, subreddit: string): RedditPost[] {
  const posts: RedditPost[] = [];
  
  // Match <item> tags, ignoring namespaces
  const itemRegex = /<(?:\w+:)?item[^>]*>(.*?)<\/(?:\w+:)?item>/gis;
  
  // Enhanced regex patterns - handle namespaces, CDATA, and attributes
  const titleRegex = /<(?:\w+:)?title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:\w+:)?title>/is;
  const linkRegex = /<(?:\w+:)?link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:\w+:)?link>/is;
  const descRegex = /<(?:\w+:)?(?:description|summary|content)[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:\w+:)?(?:description|summary|content)>/is;
  const pubDateRegex = /<(?:\w+:)?(?:pubDate|published|updated)[^>]*>(.*?)<\/(?:\w+:)?(?:pubDate|published|updated)>/is;
  
  let match;
  let matchCount = 0;
  
  while ((match = itemRegex.exec(xmlText)) !== null && posts.length < 10) {
    matchCount++;
    const itemContent = match[1];
    
    const titleMatch = titleRegex.exec(itemContent);
    const linkMatch = linkRegex.exec(itemContent);
    const descMatch = descRegex.exec(itemContent);
    const dateMatch = pubDateRegex.exec(itemContent);
    
    if (titleMatch && linkMatch) {
      // Clean HTML entities and tags from content
      const cleanTitle = decodeHTMLEntities(titleMatch[1]).trim();
      const cleanContent = descMatch ? stripHTMLTags(decodeHTMLEntities(descMatch[1])).substring(0, 500) : '';
      const cleanLink = linkMatch[1].trim();
      
      if (cleanTitle && cleanLink) {
        posts.push({
          title: cleanTitle,
          content: cleanContent,
          url: cleanLink,
          created: dateMatch ? dateMatch[1] : new Date().toISOString(),
          subreddit
        });
      }
    }
  }
  
  console.log(`📊 RSS parse: Found ${matchCount} items, extracted ${posts.length} valid posts`);
  return posts;
}

// Parse Atom format
function parseAtomFormat(xmlText: string, subreddit: string): RedditPost[] {
  const posts: RedditPost[] = [];
  
  // Match <entry> tags (Atom format)
  const entryRegex = /<(?:\w+:)?entry[^>]*>(.*?)<\/(?:\w+:)?entry>/gis;
  
  const titleRegex = /<(?:\w+:)?title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:\w+:)?title>/is;
  // Atom uses <link href="..."/> format
  const linkRegex = /<(?:\w+:)?link[^>]*href=["'](.*?)["'][^>]*\/?>/is;
  const contentRegex = /<(?:\w+:)?(?:content|summary)[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:\w+:)?(?:content|summary)>/is;
  const updatedRegex = /<(?:\w+:)?updated[^>]*>(.*?)<\/(?:\w+:)?updated>/is;
  
  let match;
  let matchCount = 0;
  
  while ((match = entryRegex.exec(xmlText)) !== null && posts.length < 10) {
    matchCount++;
    const entryContent = match[1];
    
    const titleMatch = titleRegex.exec(entryContent);
    const linkMatch = linkRegex.exec(entryContent);
    const contentMatch = contentRegex.exec(entryContent);
    const dateMatch = updatedRegex.exec(entryContent);
    
    if (titleMatch && linkMatch) {
      const cleanTitle = decodeHTMLEntities(titleMatch[1]).trim();
      const cleanContent = contentMatch ? stripHTMLTags(decodeHTMLEntities(contentMatch[1])).substring(0, 500) : '';
      const cleanLink = linkMatch[1].trim();
      
      if (cleanTitle && cleanLink) {
        posts.push({
          title: cleanTitle,
          content: cleanContent,
          url: cleanLink,
          created: dateMatch ? dateMatch[1] : new Date().toISOString(),
          subreddit
        });
      }
    }
  }
  
  console.log(`📊 Atom parse: Found ${matchCount} entries, extracted ${posts.length} valid posts`);
  return posts;
}

// PHASE 7: Fallback HTML scraping (old.reddit.com mobile)
async function scrapeRedditHTML(subreddit: string): Promise<RedditPost[]> {
  try {
    const url = `https://old.reddit.com/r/${subreddit}/new/.compact`;
    
    console.log(`🕷️ Scraping HTML from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      console.warn(`❌ HTML scrape failed: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const posts: RedditPost[] = [];
    
    // Parse compact mobile HTML - simpler structure
    const postRegex = /<div class="thing[^"]*"[^>]*>(.*?)<\/div>/gis;
    const titleLinkRegex = /<a[^>]*class="[^"]*title[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/is;
    
    let match;
    let matchCount = 0;
    
    while ((match = postRegex.exec(html)) !== null && posts.length < 10) {
      matchCount++;
      const postContent = match[1];
      
      const linkMatch = titleLinkRegex.exec(postContent);
      
      if (linkMatch) {
        const url = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://reddit.com${linkMatch[1]}`;
        const title = stripHTMLTags(decodeHTMLEntities(linkMatch[2])).trim();
        
        if (title && url) {
          posts.push({
            title,
            content: '',
            url,
            created: new Date().toISOString(),
            subreddit
          });
        }
      }
    }
    
    console.log(`🕷️ HTML scrape: Found ${matchCount} posts, extracted ${posts.length} valid posts`);
    return posts;
    
  } catch (error) {
    console.warn(`❌ HTML scraping failed:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

// PHASE 6: Content extraction helpers
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function stripHTMLTags(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Analyze posts with DeepSeek for community insights and keyword extraction
async function analyzeWithDeepSeek(posts: RedditPost[], topic: any, supabase: any): Promise<CommunityInsight[]> {
  if (!deepseekApiKey || posts.length === 0) {
    return [];
  }
  
  try {
    const postsText = posts.map(p => `${p.title}: ${p.content}`).join('\n\n');
    
    // Fetch recent published stories to cross-reference keywords
    const { data: recentStories } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        slides(content)
      `)
      .eq('is_published', true)
      .or(`article_id.in.(select id from articles where topic_id=${topic.id}),topic_article_id.in.(select id from topic_articles where topic_id=${topic.id})`)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // Extract keywords from published content
    const feedKeywords = recentStories
      ?.flatMap((story: any) => [
        story.title,
        ...(story.slides?.map((s: any) => s.content) || [])
      ])
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter((word: string) => word.length > 4)
      .slice(0, 50) // Top 50 words from feed
      || [];
    
    const feedContext = feedKeywords.length > 0 
      ? `CONTEXT: Recent published content contains these keywords: ${feedKeywords.slice(0, 20).join(', ')}`
      : '';
    
    // First prompt: Extract keyword pulse data with feed context and regional filtering
    const regionName = topic.region || topic.name;
    const keywordPrompt = `Analyze these Reddit discussions for ${topic.name}${topic.region ? ` in ${topic.region}` : ''}.

${feedContext}

${postsText}

CRITICAL REGIONAL FILTERING:
- ONLY extract keywords that are SPECIFICALLY relevant to ${regionName}
- IGNORE national UK politics, celebrities, or generic issues UNLESS they directly impact ${regionName}
- Keywords MUST relate to: local issues, local places, local services, local events, or regional concerns
- Reject keywords like: "Prince Andrew", "chocolate biscuits", "living standards" unless they specifically mention ${regionName}

Extract the top 9 keywords being discussed. PRIORITIZE keywords that:
1. Are SPECIFICALLY about ${regionName} (local places, issues, events)
2. Relate to the published content keywords above (validates your coverage)
3. Have high discussion volume on Reddit about ${regionName}
4. Show clear sentiment patterns in the LOCAL community

If Reddit keywords align with published content AND are locally relevant, prioritize those. Otherwise, extract the most discussed LOCAL topics.

For EACH of the 9 keywords provide:
- keyword: the topic/keyword name (2-3 words max, MUST be locally relevant)
- total_mentions: count of how many times discussed in relation to ${regionName}
- positive_mentions: count with positive sentiment
- negative_mentions: count with negative sentiment
- quote: a representative 3-10 word quote from discussions (must mention or relate to ${regionName})

Also identify the most active Reddit thread ABOUT ${regionName}:
- title: thread title (must be about ${regionName})
- url: full Reddit URL

Return JSON only with exactly 9 locally-relevant keywords:
{
  "keywords": [
    {
      "keyword": "pier renovations",
      "total_mentions": 23,
      "positive_mentions": 15,
      "negative_mentions": 8,
      "quote": "pier work looks promising"
    }
  ],
  "most_active_thread": {
    "title": "Discussion about pier changes in ${regionName}",
    "url": "https://reddit.com/r/..."
  }
}`;
    
    // Second prompt: Generate insights
    const insightsPrompt = `Analyze these Reddit discussions for community insights about ${topic.name}:

${postsText}

Provide 2-3 brief insights in JSON format:
{
  "insights": [
    {
      "type": "sentiment|concern|validation", 
      "content": "Brief, dyslexia-friendly summary (max 50 words)",
      "confidence": 0-100
    }
  ]
}

Focus on: local sentiment, emerging concerns, and validation of news stories. Keep language simple and clear.`;

    // Call both analyses
    const [keywordResponse, insightsResponse] = await Promise.all([
      fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: keywordPrompt }],
          max_tokens: 700,
          temperature: 0.3
        })
      }),
      fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: insightsPrompt }],
          max_tokens: 500,
          temperature: 0.3
        })
      })
    ]);

    // Process keyword data
    if (keywordResponse.ok) {
      const keywordData = await keywordResponse.json();
      const keywordContent = keywordData.choices?.[0]?.message?.content;
      
      if (keywordContent) {
        try {
          const cleanContent = keywordContent.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
          const parsed = JSON.parse(cleanContent);
          
          // Store keyword data in new table - 9 keywords split into 3 sets
          if (parsed.keywords && Array.isArray(parsed.keywords)) {
            const keywordsToStore = parsed.keywords.slice(0, 9);
            
            for (let i = 0; i < keywordsToStore.length; i++) {
              const kw = keywordsToStore[i];
              // Assign set_number: 1-3 for first 3, 4-6 for second 3, 7-9 for third 3
              const setNumber = Math.floor(i / 3) + 1;
              
              await supabase
                .from('community_pulse_keywords')
                .insert({
                  topic_id: topic.id,
                  keyword: kw.keyword,
                  total_mentions: kw.total_mentions || 0,
                  positive_mentions: kw.positive_mentions || 0,
                  negative_mentions: kw.negative_mentions || 0,
                  representative_quote: kw.quote,
                  most_active_thread_url: parsed.most_active_thread?.url,
                  most_active_thread_title: parsed.most_active_thread?.title,
                  set_number: setNumber,
                  analysis_date: new Date().toISOString().split('T')[0]
                });
            }
          }
        } catch (e) {
          console.warn('Failed to parse keyword data:', e);
        }
      }
    }

    // Process insights (existing logic)
    const response = insightsResponse;

    if (!response.ok) {
      console.warn('DeepSeek API error:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      // Fallback if no content
      return [{
        type: 'validation',
        content: `Community activity analyzed for ${topic.name}: ${posts.length} recent discussions reviewed.`,
        confidence: 50,
        metadata: { source: 'fallback', posts_analyzed: posts.length }
      }];
    }
    
    // Parse JSON response with robust handling
    try {
      // Strip code fences if present
      const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      
      // Try parsing cleaned content
      let parsed;
      try {
        parsed = JSON.parse(cleanContent);
      } catch (firstParseError) {
        // Fallback: try to extract JSON object with regex
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw firstParseError;
        }
      }
      
      const insights = parsed.insights?.map((insight: any) => ({
        type: insight.type,
        content: insight.content,
        confidence: insight.confidence || 0,
        metadata: { source: 'deepseek', posts_analyzed: posts.length }
      })) || [];
      
      // If no insights parsed, return fallback
      if (insights.length === 0) {
        return [{
          type: 'validation',
          content: `Community discussions about ${topic.name}: ${posts.length} posts analyzed.`,
          confidence: 50,
          metadata: { source: 'fallback', posts_analyzed: posts.length }
        }];
      }
      
      return insights;
      
    } catch (parseError) {
      console.warn('DeepSeek JSON parsing failed, using fallback:', parseError);
      // Generate simple fallback insight from post titles
      const titleSummary = posts.slice(0, 3).map(p => p.title).join('; ');
      return [{
        type: 'validation',
        content: `Recent community discussions: ${titleSummary.substring(0, 150)}...`,
        confidence: 40,
        metadata: { source: 'fallback', posts_analyzed: posts.length, parse_error: true }
      }];
    }
    
  } catch (error) {
    console.warn('DeepSeek analysis failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

// Store insights in database
async function storeInsights(supabase: any, topicId: string, subreddit: string, insights: CommunityInsight[]) {
  for (const insight of insights) {
    try {
      await supabase
        .from('community_insights')
        .insert({
          topic_id: topicId,
          source_type: 'reddit',
          source_identifier: subreddit,
          insight_type: insight.type,
          content: insight.content,
          confidence_score: insight.confidence,
          metadata: insight.metadata
        });
    } catch (error) {
      console.error('Error storing insight:', error);
    }
  }
}