import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishRequest {
  storyId: string;
  platform: 'instagram' | 'facebook' | 'linkedin' | 'twitter';
  scheduleAt?: string; // ISO timestamp for scheduled posts
}

interface Story {
  id: string;
  title: string;
  status: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
    alt_text: string;
  }>;
  posts: Array<{
    id: string;
    caption: string;
    hashtags: string[];
    source_attribution: string;
    platform: string;
  }>;
  article: {
    source_url: string;
    author?: string;
    region?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { storyId, platform, scheduleAt }: PublishRequest = await req.json();

    console.log('Publishing story:', storyId, 'to platform:', platform);

    if (!storyId || !platform) {
      throw new Error('Story ID and platform are required');
    }

    // Fetch the story with slides and posts
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select(`
        *,
        slides (*),
        posts (*),
        articles (source_url, author, region)
      `)
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      console.error('Story fetch error:', storyError);
      throw new Error(`Story not found: ${storyError?.message}`);
    }

    console.log('Found story:', story.title);

    // Ensure story is ready for publishing
    if (story.status !== 'ready') {
      throw new Error('Story must be in "ready" status to publish');
    }

    // Get or create post for this platform
    let post = story.posts?.find((p: any) => p.platform === platform);
    
    if (!post) {
      // Create post record if it doesn't exist
      const { data: newPost, error: postError } = await supabase
        .from('posts')
        .insert({
          story_id: storyId,
          platform: platform,
          caption: await generatePostCaption(story),
          hashtags: await generateHashtags(story),
          source_attribution: story.articles?.author 
            ? `Summarised from an article in [publication], by ${story.articles.author}`
            : `Summarised from an [publication] article`,
          status: 'draft'
        })
        .select()
        .single();

      if (postError) {
        console.error('Post creation error:', postError);
        throw new Error(`Failed to create post: ${postError.message}`);
      }
      
      post = newPost;
    }

    // Generate combined post content
    const combinedContent = await generateCombinedContent(story, post);

    // For now, we'll update the post status and prepare for Buffer/scheduling
    // In a real implementation, this would integrate with social media APIs
    const updateData: any = {
      status: scheduleAt ? 'scheduled' : 'published',
      caption: combinedContent
    };

    if (scheduleAt) {
      updateData.scheduled_at = scheduleAt;
    } else {
      updateData.published_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('posts')
      .update(updateData)
      .eq('id', post.id);

    if (updateError) {
      console.error('Post update error:', updateError);
      throw new Error(`Failed to update post: ${updateError.message}`);
    }

    // Log the publishing action
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Story ${storyId} ${scheduleAt ? 'scheduled' : 'published'} to ${platform}`,
        context: {
          story_id: storyId,
          platform: platform,
          post_id: post.id,
          scheduled_at: scheduleAt
        },
        function_name: 'social-media-publisher'
      });

    console.log(`Successfully ${scheduleAt ? 'scheduled' : 'published'} story to ${platform}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        postId: post.id,
        status: scheduleAt ? 'scheduled' : 'published',
        platform: platform,
        scheduledAt: scheduleAt
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in social-media-publisher function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function generatePostCaption(story: Story): Promise<string> {
  // Create a shortened version of the story for the caption
  const slides = story.slides
    .sort((a, b) => a.slide_number - b.slide_number)
    .slice(0, Math.min(3, story.slides.length)); // Take first 3 slides for caption

  const caption = slides
    .map(slide => slide.content)
    .join(' • ');

  return caption;
}

async function generateHashtags(story: Story): Promise<string[]> {
  const baseHashtags = ['#LocalNews', '#Breaking'];
  
  // Add region-based hashtags
  if (story.article?.region) {
    const region = story.article.region.toLowerCase().replace(/\s+/g, '');
    baseHashtags.push(`#${region}`, `#${region}News`);
  }

  // Add topic-based hashtags based on story content
  const title = story.title.toLowerCase();
  if (title.includes('police')) baseHashtags.push('#Police', '#Crime');
  if (title.includes('fire')) baseHashtags.push('#Fire', '#Emergency');
  if (title.includes('rescue')) baseHashtags.push('#Rescue', '#Emergency');
  if (title.includes('council')) baseHashtags.push('#Council', '#LocalPolitics');
  if (title.includes('school')) baseHashtags.push('#Education', '#Schools');
  if (title.includes('hospital')) baseHashtags.push('#Healthcare', '#NHS');

  return [...new Set(baseHashtags)]; // Remove duplicates
}

async function generateCombinedContent(story: Story, post: any): Promise<string> {
  // Combine post caption with individual slides for those who want to read in a block
  const sortedSlides = story.slides.sort((a, b) => a.slide_number - b.slide_number);
  
  const slideContent = sortedSlides
    .map((slide, index) => `${index + 1}. ${slide.content}`)
    .join('\n\n');

  const hashtags = Array.isArray(post.hashtags) 
    ? post.hashtags.join(' ') 
    : '';

  // Add source URL (though it won't be live initially)
  const sourceUrl = story.article?.source_url || '';

  const combinedContent = [
    post.caption || '', // Post copy
    '',
    '📖 Full story:',
    slideContent,
    '',
    hashtags,
    '',
    post.source_attribution || '',
    sourceUrl ? `🔗 Source: ${sourceUrl}` : ''
  ].filter(line => line.trim()).join('\n');

  return combinedContent;
}