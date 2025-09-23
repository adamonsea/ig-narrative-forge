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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🏘️ Starting CAREFUL Reddit community processing...');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get topics with community intelligence enabled (process max 3 at a time)
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, region, topic_type, community_config, community_intelligence_enabled')
      .eq('community_intelligence_enabled', true)
      .limit(3);

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
        
        // Discover relevant subreddits based on topic type
        const subreddits = await discoverSubreddits(topic);
        console.log(`📡 Found ${subreddits.length} subreddits for ${topic.name}`);
        
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
                const insights = await analyzeWithDeepSeek(posts, topic);
                
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
          error: topicError.message
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
      JSON.stringify({ error: error.message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Discover relevant subreddits based on topic type and content
async function discoverSubreddits(topic: any): Promise<string[]> {
  const subreddits: string[] = [];
  
  if (topic.topic_type === 'regional' && topic.region) {
    // Regional topics - look for local subreddits
    const region = topic.region.toLowerCase();
    
    // Common UK local subreddit patterns
    if (region.includes('eastbourne')) subreddits.push('eastbourne');
    if (region.includes('brighton')) subreddits.push('brighton', 'brightonandhove');
    if (region.includes('london')) subreddits.push('london');
    if (region.includes('manchester')) subreddits.push('manchester');
    if (region.includes('birmingham')) subreddits.push('birmingham');
    
    // Generic UK subreddits for local context
    subreddits.push('unitedkingdom', 'casualuk');
  } else {
    // Keyword/niche topics - look for relevant professional subreddits
    const topicName = topic.name.toLowerCase();
    
    if (topicName.includes('ai') || topicName.includes('artificial intelligence')) {
      subreddits.push('artificial', 'MachineLearning');
    }
    if (topicName.includes('marketing')) {
      subreddits.push('marketing', 'digitalmarketing');
    }
    if (topicName.includes('technology') || topicName.includes('tech')) {
      subreddits.push('technology', 'TechNews');
    }
    if (topicName.includes('business')) {
      subreddits.push('business', 'entrepreneur');
    }
  }
  
  return subreddits.slice(0, 3); // Limit to 3 subreddits max
}

// Fetch Reddit RSS with conservative rate limiting
async function fetchRedditRSS(subreddit: string): Promise<RedditPost[]> {
  try {
    const rssUrl = `https://www.reddit.com/r/${subreddit}.rss?limit=10`;
    
    // Use various user agents to appear more natural
    const userAgents = [
      'Mozilla/5.0 (compatible; RSS Reader Bot)',
      'Mozilla/5.0 (compatible; NewsBot/1.0)',
      'RSS/Atom Reader'
    ];
    
    const randomAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': randomAgent,
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      console.warn(`RSS fetch failed for r/${subreddit}: ${response.status}`);
      return [];
    }
    
    const xmlText = await response.text();
    
    // Basic XML parsing for RSS (simplified)
    const posts: RedditPost[] = [];
    const itemRegex = /<item>(.*?)<\/item>/gs;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/s;
    const linkRegex = /<link>(.*?)<\/link>/s;
    const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/s;
    
    let match;
    while ((match = itemRegex.exec(xmlText)) !== null && posts.length < 5) {
      const itemContent = match[1];
      
      const titleMatch = titleRegex.exec(itemContent);
      const linkMatch = linkRegex.exec(itemContent);
      const descMatch = descRegex.exec(itemContent);
      
      if (titleMatch && linkMatch) {
        posts.push({
          title: titleMatch[1],
          content: descMatch ? descMatch[1].substring(0, 500) : '',
          url: linkMatch[1],
          created: new Date().toISOString(),
          subreddit
        });
      }
    }
    
    console.log(`✅ Fetched ${posts.length} posts from r/${subreddit}`);
    return posts;
    
  } catch (error) {
    console.warn(`Failed to fetch RSS for r/${subreddit}:`, error.message);
    return [];
  }
}

// Analyze posts with DeepSeek for community insights
async function analyzeWithDeepSeek(posts: RedditPost[], topic: any): Promise<CommunityInsight[]> {
  if (!deepseekApiKey || posts.length === 0) {
    return [];
  }
  
  try {
    const postsText = posts.map(p => `${p.title}: ${p.content}`).join('\n\n');
    
    const prompt = `Analyze these Reddit discussions for community insights about ${topic.name}:

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

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      console.warn('DeepSeek API error:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return [];
    
    // Parse JSON response
    const parsed = JSON.parse(content);
    
    return parsed.insights?.map((insight: any) => ({
      type: insight.type,
      content: insight.content,
      confidence: insight.confidence || 0,
      metadata: { source: 'deepseek', posts_analyzed: posts.length }
    })) || [];
    
  } catch (error) {
    console.warn('DeepSeek analysis failed:', error.message);
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