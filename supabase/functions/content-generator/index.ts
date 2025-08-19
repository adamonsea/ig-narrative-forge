import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Article {
  id: string;
  title: string;
  body: string;
  author?: string;
  region?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  source_url: string;
}

interface SlideContent {
  slideNumber: number;
  content: string;
  altText: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    console.log('Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasOpenAIKey: !!openAIApiKey
    });
    
    if (!supabaseUrl || !supabaseKey || !openAIApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { articleId, slideType = 'tabloid' } = await req.json();

    console.log('Processing article ID:', articleId);

    if (!articleId) {
      throw new Error('Article ID is required');
    }

    // Fetch the article
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();

    if (articleError) {
      console.error('Article fetch error:', articleError);
      throw new Error(`Article not found: ${articleError.message}`);
    }
    
    if (!article) {
      throw new Error('Article not found');
    }

    console.log('Found article:', article.title);

    // Check if story already exists for this article
    let story;
    const { data: existingStory } = await supabase
      .from('stories')
      .select('*')
      .eq('article_id', articleId)
      .single();

    if (existingStory) {
      console.log('Story already exists for article:', articleId, 'Story ID:', existingStory.id);
      story = existingStory;
      
      // Update status to processing if it's not already published
      if (story.status !== 'published') {
        const { error: updateError } = await supabase
          .from('stories')
          .update({ status: 'processing' })
          .eq('id', story.id);
        
        if (updateError) {
          console.error('Failed to update story status:', updateError);
        }
      }
    } else {
      // Create new story record
      const { data: newStory, error: storyError } = await supabase
        .from('stories')
        .insert({
          article_id: articleId,
          title: article.title,
          status: 'processing'
        })
        .select()
        .single();

      if (storyError) {
        console.error('Story creation error:', storyError);
        throw new Error(`Failed to create story: ${storyError.message}`);
      }
      
      story = newStory;
    }
    
    if (!story) {
      throw new Error('Failed to create story');
    }

    console.log('Created story:', story.id);

    // Extract publication name from source URL first for proper attribution in slides
    const publicationName = await extractPublicationName(article.source_url, supabase, articleId);
    console.log(`✅ Validated publication: ${publicationName}`);

    console.log('🤖 Starting slide generation for article:', article.title);
    
    // Extract hook promises from headline for validation
    const hookPromises = extractHookPromises(article.title);
    console.log('🎯 Extracted hook promises from headline:', hookPromises);
    
    // Generate slides using OpenAI with publication name for proper attribution
    let slides = await generateSlides(article, openAIApiKey, slideType, publicationName);

    if (!slides || slides.length === 0) {
      console.error('❌ No slides generated for article:', article.title);
      return new Response(JSON.stringify({ error: 'Failed to generate slides' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate promise delivery if promises were detected
    if (hookPromises.length > 0) {
      const promisesDelivered = validatePromiseDelivery(slides, hookPromises);
      console.log('📋 Promise delivery validation:', {
        promises: hookPromises,
        delivered: promisesDelivered
      });

      if (!promisesDelivered) {
        console.log('⚠️ Slides failed promise delivery validation, regenerating...');
        // Regenerate with explicit promise delivery requirement
        slides = await generateSlides(article, openAIApiKey, slideType, publicationName, hookPromises);
        
        // Validate again
        const secondValidation = validatePromiseDelivery(slides, hookPromises);
        if (!secondValidation) {
          console.warn('⚠️ Second generation also failed promise validation, proceeding with content');
        } else {
          console.log('✅ Second generation passed promise validation');
        }
      } else {
        console.log('✅ Slides passed promise delivery validation');
      }
    }

    console.log(`✅ Generated ${slides.length} slides for article: ${article.title}`);

    // Generate social media post copy with hashtags
    const postCopy = await generatePostCopy(article, publicationName, openAIApiKey);
    console.log('Generated post copy:', postCopy);

    // Delete any existing slides and posts for this story
    if (existingStory) {
      const { error: deleteError } = await supabase
        .from('slides')
        .delete()
        .eq('story_id', existingStory.id);
      
      if (deleteError) {
        console.error('Error deleting existing slides:', deleteError);
      }

      // Delete existing posts
      const { error: deletePostError } = await supabase
        .from('posts')
        .delete()
        .eq('story_id', existingStory.id);
      
      if (deletePostError) {
        console.error('Error deleting existing posts:', deletePostError);
      }
    }

    // Verify story still exists before inserting slides (handles race conditions)
    const { data: storyCheck, error: storyCheckError } = await supabase
      .from('stories')
      .select('id')
      .eq('id', story.id)
      .single();

    if (storyCheckError || !storyCheck) {
      console.error('Story was deleted during generation - likely by another process');
      throw new Error('Story was deleted during generation process');
    }

    // Insert the new slides
    console.log(`Inserting slides: ${slides.length}`);
    const { error: insertError } = await supabase
      .from('slides')
      .insert(
        slides.map(slide => ({
          story_id: story.id,
          slide_number: slide.slideNumber,
          content: slide.content,
          visual_prompt: slide.visualPrompt || `Create an engaging visual for: ${slide.content}`,
          alt_text: slide.altText,
          word_count: slide.content.split(' ').length
        }))
      );

    if (insertError) {
      console.error('Error inserting slides:', insertError);
      throw new Error(`Failed to insert slides: ${insertError.message}`);
    }

    // Update the story with publication info and source attribution
    const sourceAttribution = article.author 
      ? `Summarised from an article in ${publicationName}, by ${article.author}`
      : `Summarised from an article in ${publicationName}`;

    const { error: storyUpdateError } = await supabase
      .from('stories')
      .update({ 
        status: 'draft',
        publication_name: publicationName,
        author: article.author
      })
      .eq('id', story.id);

    if (storyUpdateError) {
      console.error('Error updating story:', storyUpdateError);
      throw new Error(`Failed to update story: ${storyUpdateError.message}`);
    }

    // Update the article processing status to 'processed' so it disappears from content pipeline
    const { error: articleUpdateError } = await supabase
      .from('articles')
      .update({ processing_status: 'processed' })
      .eq('id', articleId);

    if (articleUpdateError) {
      console.error('Error updating article processing status:', articleUpdateError);
      // Don't throw error - story creation succeeded, this is just cleanup
    } else {
      console.log('Article processing status updated to processed');
    }

    // Create a post record with the generated content
    const { error: postError } = await supabase
      .from('posts')
      .insert({
        story_id: story.id,
        platform: 'instagram', // Default to Instagram
        caption: postCopy.caption,
        hashtags: postCopy.hashtags,
        source_attribution: sourceAttribution,
        status: 'draft'
      });

    if (postError) {
      console.error('Error creating post:', postError);
      // Don't throw error for post creation as slides are more important
    }

    console.log('Updated story status to draft for review...');

    return new Response(
      JSON.stringify({ 
        success: true, 
        storyId: story.id,
        slideCount: slides.length,
        slides: slides
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ ERROR in content-generator function:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // If we have a story ID, reset its status to draft so it can be retried
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (supabaseUrl && supabaseKey) {
      const supabaseInstance = createClient(supabaseUrl, supabaseKey);
      
      if (story?.id) {
        try {
          console.log('🔄 Resetting story status to draft due to error...');
          await supabaseInstance
            .from('stories')
            .update({ status: 'draft' })
            .eq('id', story.id);
        } catch (resetError) {
          console.error('Failed to reset story status:', resetError);
        }
      }
    }
    
    // Log detailed error for debugging
    try {
      await supabase
        .from('system_logs')
        .insert({
          level: 'error',
          message: `Content generation failed: ${error.message}`,
          context: {
            error_type: error.name,
            error_message: error.message,
            story_id: story?.id,
            article_id: articleId
          },
          function_name: 'content-generator'
        });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: 'Story has been reset to draft status for retry'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// Extract hook promises from headline for validation
function extractHookPromises(headline: string): string[] {
  const promises: string[] = [];
  const promiseIndicators = [
    'secrecy', 'secret', 'secrets', 'hidden', 'revealed', 'exclusive',
    'rivalry', 'conflict', 'battle', 'clash', 'feud', 'tension',
    'shocking', 'scandal', 'controversial', 'unprecedented', 'dramatic',
    'mystery', 'unknown', 'behind closed doors', 'insider', 'exclusive'
  ];
  
  const lowerHeadline = headline.toLowerCase();
  promiseIndicators.forEach(indicator => {
    if (lowerHeadline.includes(indicator)) {
      promises.push(indicator);
    }
  });
  
  return promises;
}

// Validate that slides deliver on headline promises
function validatePromiseDelivery(slides: SlideContent[], promises: string[]): boolean {
  if (promises.length === 0) return true;
  
  const allSlideContent = slides.map(s => s.content.toLowerCase()).join(' ');
  
  // Check if at least 70% of promises are addressed in slides
  const deliveredPromises = promises.filter(promise => 
    allSlideContent.includes(promise) || 
    allSlideContent.includes(promise.replace('y', 'ies')) || // secrecy -> secrets
    allSlideContent.includes(promise.substring(0, promise.length - 1)) // rivalry -> rival
  );
  
  return deliveredPromises.length >= Math.ceil(promises.length * 0.7);
}

async function generateSlides(article: Article, openAIApiKey: string, slideType: string = 'tabloid', publicationName: string, hookPromises?: string[]): Promise<SlideContent[]> {
  const getSlidePrompt = (type: string) => {
    switch (type) {
      case 'short':
        return `You are an expert social media storyteller who transforms news into compelling narrative journeys.

CRITICAL HOOK PROMISE DELIVERY:
Before writing anything, analyze the headline for specific promises (secrecy, rivalry, drama, exclusives, etc.).
EVERY promise made in the headline MUST be addressed with specific details in your slides.
If headline mentions "secrecy" - reveal the actual secrets.
If headline mentions "rivalry" - explain the specific conflict details.
Never make promises you don't deliver on.

NARRATIVE FLOW MASTERY:
Each slide must flow naturally into the next like chapters in a story:
- Use connecting phrases: "But here's what nobody saw coming...", "Meanwhile...", "The twist? ..."
- End each slide with a hook for the next: "...and that's when everything changed."
- Create momentum with escalating reveals and emotional beats
- Make it feel like a conversation, not bullet points

LIVELY LANGUAGE REQUIREMENTS:
- Use conversational, energetic tone ("Here's the wild part..." "You won't believe...")
- Replace boring verbs with dynamic ones (happened → exploded, said → revealed)
- Include sensory details and vivid imagery
- Use rhetorical questions to engage readers
- Inject personality and attitude into every sentence

GEOGRAPHIC CONTEXT MANDATORY:
- ALWAYS mention the primary location by Slide 2
- Connect to local landmarks, community relevance
- Use phrases like "In [Location]", "[Location] residents discovered..."

REQUIREMENTS:
- Create exactly 4 slides that flow like a story
- Slide 1 (Hook): ≤15 words - Deliver on headline promises immediately
- Slide 2: ≤25 words - Build context with smooth transition + regional reference
- Slide 3: ≤35 words - Escalate with emotional peaks and story momentum
- Slide 4: ≤40 words - Satisfying conclusion + source attribution

TRANSITION EXAMPLES:
"But the real shock came next..." / "That's when locals realized..." / "The plot thickens..."

FINAL SLIDE SOURCE FORMAT:
"Summarised from an article in ${publicationName}, by [Author]" (when author available)
OR "Summarised from an article in ${publicationName}" (when no author)

STYLE: Conversational storytelling that keeps readers hooked slide after slide.`;

      case 'indepth':
        return `You are an expert narrative architect who creates compelling story journeys from news articles.

CRITICAL HOOK PROMISE DELIVERY:
Before writing anything, analyze the headline for specific promises (secrecy, rivalry, drama, exclusives, etc.).
EVERY promise made in the headline MUST be addressed with specific details in your slides.
If headline mentions "secrecy" - reveal the actual secrets.
If headline mentions "rivalry" - explain the specific conflict details.
Never make promises you don't deliver on.

NARRATIVE FLOW MASTERY:
Each slide must flow naturally into the next like chapters in an unfolding story:
- Use connecting phrases: "But here's where it gets interesting...", "Meanwhile behind the scenes...", "The twist nobody saw coming..."
- End each slide with intrigue for the next: "...but that was just the beginning."
- Create escalating emotional beats and reveals
- Make it feel like compelling storytelling, not information dumps

LIVELY LANGUAGE REQUIREMENTS:
- Use conversational, energetic tone ("Here's what's really happening..." "The truth is wild...")
- Replace boring verbs with dynamic ones (occurred → erupted, revealed → exposed)
- Include sensory details and vivid imagery
- Use rhetorical questions to engage readers
- Inject personality and insider knowledge into every sentence

COMPREHENSIVE ANGLE-MINING: Dig deep for:
- Multiple hidden hooks and secondary storylines buried in the content
- Unexpected connections to past events or future implications
- Contradictory perspectives or stakeholder conflicts not emphasized
- Data points that tell a different story than the main narrative
- Historical context that reveals patterns or ironies
- Expert implications or analysis hidden in quotes
- Local events, landmarks, or community angles (airshows, festivals, local businesses)

GEOGRAPHIC CONTEXT MANDATORY:
- ALWAYS mention the primary location by Slide 2
- Connect to local landmarks, community relevance throughout
- Use phrases like "In [Location]", "[Location] residents discovered..."

REQUIREMENTS:
- Create exactly 10-12 slides that flow like an unfolding investigation
- Slide 1 (Hook): ≤15 words - Deliver on headline promises with compelling opener
- Slide 2 (Background): ≤25 words - Set context with smooth transition + regional reference
- Slides 3-6: ≤30 words each - Layer multiple revelations with story momentum
- Slides 7-9: ≤35 words each - Analysis with emotional resonance and flow
- Slide 10 (Future): ≤35 words - What happens next with narrative completion
- Final slide: ≤40 words - Satisfying conclusion + source attribution

TRANSITION EXAMPLES:
"But the investigation revealed..." / "That's when locals discovered..." / "The real story emerged when..."

FINAL SLIDE SOURCE FORMAT:
"Summarised from an article in ${publicationName}, by [Author]" (when author available)
OR "Summarised from an article in ${publicationName}" (when no author)

STYLE: Multi-layered investigative storytelling with smooth narrative flow and strong regional identity.`;

      default: // tabloid
        return `You are an expert social media storyteller who creates engaging, dramatic narratives from news.

CRITICAL HOOK PROMISE DELIVERY:
Before writing anything, analyze the headline for specific promises (secrecy, rivalry, drama, exclusives, etc.).
EVERY promise made in the headline MUST be addressed with specific details in your slides.
If headline mentions "secrecy" - reveal the actual secrets.
If headline mentions "rivalry" - explain the specific conflict details.
Never make promises you don't deliver on.

NARRATIVE FLOW MASTERY:
Each slide must flow naturally into the next with dramatic storytelling:
- Use connecting phrases: "But wait, it gets better...", "Then this happened...", "Plot twist ahead..."
- End each slide with cliffhanger momentum: "...and that's when things got really wild."
- Create escalating drama and emotional peaks
- Make it feel like an engaging conversation, not bullet points

LIVELY LANGUAGE REQUIREMENTS:
- Use conversational, dramatic tone ("Wait until you hear this..." "The community is buzzing...")
- Replace boring verbs with dynamic ones (happened → exploded, announced → dropped the bombshell)
- Include sensory details and vivid imagery
- Use rhetorical questions to engage readers
- Inject excitement and insider perspective into every sentence

SENSATIONAL ANGLE-MINING: Hunt aggressively for:
- Shocking details or statistics buried deeper in the article
- Human interest elements not emphasized in the lead
- Dramatic contrasts, before/after scenarios, or "us vs them" dynamics
- Emotional core or personal stakes hidden in factual reporting
- Exclusive details that competitors might miss or underplay
- Local connections or community impact buried in broader narrative
- Local events, landmarks, or community angles (airshows, festivals, local businesses)

GEOGRAPHIC CONTEXT MANDATORY:
- ALWAYS mention the primary location by Slide 2
- Connect to local landmarks, community relevance throughout
- Use phrases like "In [Location]", "[Location] residents are talking about..."

REQUIREMENTS:
- Create exactly 8 slides that flow like dramatic storytelling
- Slide 1 (Hook): ≤15 words - Deliver on headline promises with dramatic opener
- Slide 2 (Context): ≤20 words - Set scene with smooth transition + regional reference
- Slides 3-5: ≤30 words each - Build tension with story momentum and reveals
- Slides 6-7: ≤35 words each - Impact with emotional resonance and community stakes
- Final slide: ≤40 words - Satisfying conclusion + source attribution

TRANSITION EXAMPLES:
"But here's the kicker..." / "Then locals realized..." / "The community was shocked when..."

FINAL SLIDE SOURCE FORMAT:
"Summarised from an article in ${publicationName}, by [Author]" (when author available)
OR "Summarised from an article in ${publicationName}" (when no author)

STYLE: Dramatic storytelling that reveals hidden drama and tension with smooth narrative flow and strong regional identity.`;
    }
  };

  const systemPrompt = `${getSlidePrompt(slideType)}

UNIVERSAL GUIDELINES:
- Use active voice and power words (exclusive, urgent, proven, secret, insider)
- Create emotional connection with local relevance and community identity
- Include specific details, numbers, and credible sources
- Apply psychological triggers: scarcity, social proof, authority, reciprocity
- Build tension with "but," "however," "until now" transitions
- Use inclusive language ("we," "us," "our community")
- End final slide with source attribution and clear CTA
- Maintain trustworthy, editorial tone throughout
- Each slide should work standalone but flow together

TEXT-ONLY FOCUS: Generate engaging text content only. No visual elements needed.

Return ONLY valid JSON with this structure:
{
  "slides": [
    {
      "slideNumber": 1,
      "content": "Hook content here",
      "altText": "Brief description for accessibility"
    }
  ]
}`;

  let userPrompt = `Transform this article into engaging carousel slides:

TITLE: ${article.title}
AUTHOR: ${article.author || 'Unknown'}
REGION: ${article.region || 'Unknown'}
CATEGORY: ${article.category || 'News'}

CONTENT:
${article.body}

Create slides that capture the essence of this story while being engaging for social media.`;

  // If this is a regeneration with specific hook promises, add explicit requirements
  if (hookPromises && hookPromises.length > 0) {
    userPrompt += `

⚠️ CRITICAL PROMISE DELIVERY REQUIREMENT:
The headline makes these specific promises that MUST be delivered in your slides:
${hookPromises.map(promise => `- "${promise}": You must explain/reveal specific details about this`).join('\n')}

Each of these promises MUST be addressed with concrete details in your slides. If the headline mentions "secrecy", reveal the actual secrets. If it mentions "rivalry", explain the specific conflict. Don't just hint at these elements - deliver on them explicitly.`;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5-mini-2025-08-07',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 3000,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI API error:', errorData);
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  console.log('OpenAI API response data:', JSON.stringify(data, null, 2));
  
  const content = data.choices[0].message.content;
  console.log('OpenAI content to parse:', content);
  
  try {
    const parsed = JSON.parse(content);
    console.log('Parsed OpenAI response:', parsed);
    
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      console.error('Invalid response structure:', parsed);
      throw new Error(`Invalid response format from OpenAI. Expected 'slides' array, got: ${typeof parsed.slides}`);
    }
    
    if (parsed.slides.length === 0) {
      throw new Error('OpenAI returned empty slides array');
    }
    
    // Validate slide structure
    for (let i = 0; i < parsed.slides.length; i++) {
      const slide = parsed.slides[i];
      if (!slide.slideNumber || !slide.content || !slide.altText) {
        console.error(`Invalid slide ${i}:`, slide);
        throw new Error(`Slide ${i} missing required properties`);
      }
    }
    
    return parsed.slides;
  } catch (parseError) {
    console.error('JSON Parse error:', parseError);
    console.error('Raw OpenAI response content:', content);
    throw new Error(`Failed to parse AI response: ${parseError.message}`);
  }
}

// Enhanced function to extract and validate publication name from URL
async function extractPublicationName(sourceUrl: string, supabase: any, articleId?: string): Promise<string> {
  try {
    const url = new URL(sourceUrl);
    const domain = url.hostname.toLowerCase();
    const cleanDomain = domain.replace(/^www\./, '');
    
    console.log(`🔍 Extracting publication from URL: ${sourceUrl}`);
    console.log(`🌐 Detected domain: ${cleanDomain}`);
    
    // Enhanced publication mappings with validation
    const publicationMap: { [key: string]: string } = {
      'theargus.co.uk': 'The Argus',
      'sussexexpress.co.uk': 'Sussex Express', 
      'eastbourneherald.co.uk': 'The Herald',
      'brightonandhovenews.org': 'Brighton & Hove News',
      'hastingsobserver.co.uk': 'Hastings Observer',
      'bbc.co.uk': 'BBC',
      'bbc.com': 'BBC',
      'theguardian.com': 'The Guardian',
      'independent.co.uk': 'The Independent',
      'telegraph.co.uk': 'The Telegraph',
      'dailymail.co.uk': 'Daily Mail',
      'mirror.co.uk': 'Daily Mirror',
      'itv.com': 'ITV News',
      'sky.com': 'Sky News',
      'eastbourne.news': 'Eastbourne News',
      'eastsussex.news': 'East Sussex News',
      'eastbournereporter.co.uk': 'Eastbourne Reporter'
    };
    
    let extractedName = '';
    let validationStatus = 'pending';
    let isValid = true;
    
    // Check for exact match first
    if (publicationMap[cleanDomain]) {
      extractedName = publicationMap[cleanDomain];
      validationStatus = 'validated';
      console.log(`✅ Exact match found: ${extractedName}`);
    } else {
      // Try subdomain matching
      const subdomainMatch = Object.keys(publicationMap).find(key => 
        cleanDomain.includes(key) || key.includes(cleanDomain.split('.')[0])
      );
      
      if (subdomainMatch) {
        extractedName = publicationMap[subdomainMatch];
        validationStatus = 'subdomain_match';
        console.log(`🔄 Subdomain match found: ${extractedName}`);
      } else {
        // Fallback formatting with enhanced logic
        const domainParts = cleanDomain.replace(/\.(co\.uk|com|org|net|co)$/, '').split('.');
        
        if (domainParts.length > 1) {
          // Handle subdomains (e.g., news.bbc.co.uk -> BBC News)
          extractedName = domainParts
            .reverse()
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
        } else {
          extractedName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
        }
        
        validationStatus = 'auto_generated';
        isValid = false; // Requires manual verification
        console.log(`⚠️ Auto-generated name: ${extractedName} (requires validation)`);
      }
    }
    
    // Log the attribution for audit trail
    if (articleId && supabase) {
      try {
        await supabase
          .from('source_attributions')
          .insert({
            article_id: articleId,
            extracted_publication: extractedName,
            source_url: sourceUrl,
            detected_domain: cleanDomain,
            validation_status: validationStatus,
            is_valid: isValid
          });
        
        console.log(`📝 Logged source attribution for article ${articleId}`);
      } catch (auditError) {
        console.error('Failed to log source attribution:', auditError);
      }
    }
    
    const finalName = extractedName || 'Local News Source';
    console.log(`📰 Final publication name: ${finalName}`);
    
    return finalName;
    
  } catch (error) {
    console.error('❌ Error extracting publication name:', error);
    
    // Log the error for debugging
    if (articleId && supabase) {
      try {
        await supabase
          .from('source_attributions')
          .insert({
            article_id: articleId,
            extracted_publication: 'Local News Source',
            source_url: sourceUrl,
            detected_domain: 'error',
            validation_status: 'error',
            is_valid: false
          });
      } catch (auditError) {
        console.error('Failed to log error attribution:', auditError);
      }
    }
    
    return 'Local News Source';
  }
}

// Function to generate social media post copy with hashtags
async function generatePostCopy(article: Article, publicationName: string, openAIApiKey: string) {
  const systemPrompt = `You are a social media expert creating engaging Instagram captions for local news carousel posts. 

  Create compelling post copy that:
  - Starts with a hook that makes people want to swipe through the carousel
  - Includes a brief summary of the key story points
  - Ends with proper source attribution
  - Includes relevant local hashtags for discovery
  - Stays under 2000 characters (Instagram limit)
  - Uses engaging, conversational tone

  HASHTAG STRATEGY:
  - Always include location-based hashtags for the region mentioned
  - Add category hashtags (#LocalNews, #Community, etc.)
  - Include 8-15 hashtags total
  - Focus on Sussex/Eastbourne/Brighton area hashtags when relevant
  
  OUTPUT FORMAT:
  Return valid JSON:
  {
    "caption": "The full Instagram caption text",
    "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
  }`;

  const userPrompt = `Create Instagram post copy for this local news story:

  Title: ${article.title}
  Author: ${article.author || 'Not specified'}
  Publication: ${publicationName}
  Region: ${article.region || 'Sussex'}
  Body: ${article.body}
  
  Include proper source attribution: "Summarised from an article in ${publicationName}${article.author ? `, by ${article.author}` : ''}"`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API response not ok:', response.status, response.statusText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Post copy OpenAI response:', data);

    const content = data.choices[0].message.content;
    const parsedResponse = JSON.parse(content);
    
    return {
      caption: parsedResponse.caption,
      hashtags: parsedResponse.hashtags || []
    };
  } catch (error) {
    console.error('Error generating post copy:', error);
    // Fallback post copy
    return {
      caption: `${article.title} 🗞️\n\n${article.body?.substring(0, 200)}...\n\nSummarised from an article in ${publicationName}${article.author ? `, by ${article.author}` : ''}`,
      hashtags: ['LocalNews', 'Sussex', 'Community', 'News']
    };
  }
}