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

    console.log('🤖 Starting slide generation for article:', article.title);
    
    // Generate slides using OpenAI
    const slides = await generateSlides(article, openAIApiKey, slideType);

    if (!slides || slides.length === 0) {
      console.error('❌ No slides generated for article:', article.title);
      return new Response(JSON.stringify({ error: 'Failed to generate slides' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Generated ${slides.length} slides for article: ${article.title}`);

    // Extract publication name from source URL with enhanced validation
    const publicationName = await extractPublicationName(article.source_url, supabase, articleId);
    console.log(`✅ Validated publication: ${publicationName}`);

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
    console.error('Error in content-generator function:', error);
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

async function generateSlides(article: Article, openAIApiKey: string, slideType: string = 'tabloid'): Promise<SlideContent[]> {
  const getSlidePrompt = (type: string) => {
    switch (type) {
      case 'short':
        return `You are an expert investigative social media content creator who finds buried angles in news stories.

CRITICAL: GEOGRAPHIC/REGIONAL CONTEXT MANDATORY
Every story MUST include specific geographic/regional references in multiple slides:
- ALWAYS mention the primary location (city, town, area) in Slide 1 or 2
- Include regional context even if not emphasized in original article
- Connect local landmarks, events, or community relevance where possible
- Use phrases like "In [Location]", "Near [Location]", "[Location] residents", "Off [Location] coast"

ANGLE-MINING PRIORITY: Go beyond the headline and lead. Hunt for:
- Surprising statistics or numbers that reveal unexpected scale/impact
- Contradictions, ironies, or "what if" moments buried in the text
- Emotional stakes or human drama not emphasized in original reporting
- Timeline surprises (how fast/slow things happened vs expectations)
- Stakeholder impacts not obvious in the main narrative
- Geographic/local connections that aren't highlighted
- Local events, landmarks, or community angles (airshows, festivals, local businesses)

RUTHLESS CONTENT FILTERING: For SHORT format, DISCARD:
- Standard background information and obvious context
- Predictable details and conventional reporting elements
- Anything that doesn't serve the core hook or emotional payoff

REQUIREMENTS:
- Create exactly 4 slides from the article
- Slide 1 (Hook): ≤15 words - ONE killer buried angle that grabs attention
- Slide 2: ≤25 words - Build context with social proof or urgency PLUS regional reference
- Slide 3: ≤35 words - Deliver key information with emotional triggers
- Slide 4: ≤40 words - Strong CTA + source attribution (mention original publication)

FINAL SLIDE SOURCE FORMAT:
Always end the final slide with proper attribution:
"Summarised from an article in [Publication], by [Author]" (when author available)
OR "Summarised from an article in [Publication]" (when no author)

BEHAVIORAL NUDGES: Use scarcity, social proof, authority, and local relevance throughout.
STYLE: Laser-focused on the most compelling hidden narrative thread with strong regional identity.`;

      case 'indepth':
        return `You are an expert investigative social media content creator who uncovers buried angles in news stories.

CRITICAL: GEOGRAPHIC/REGIONAL CONTEXT MANDATORY
Every story MUST include specific geographic/regional references throughout:
- ALWAYS mention the primary location (city, town, area) by Slide 2
- Include regional context even if not emphasized in original article
- Connect local landmarks, events, or community relevance where possible
- Use phrases like "In [Location]", "Near [Location]", "[Location] residents", "Off [Location] coast"

COMPREHENSIVE ANGLE-MINING: Dig deep for:
- Multiple hidden hooks and secondary storylines buried in the content
- Unexpected connections to past events or future implications
- Contradictory perspectives or stakeholder conflicts not emphasized
- Data points that tell a different story than the main narrative
- Historical context that reveals patterns or ironies
- Expert implications or analysis hidden in quotes
- Local events, landmarks, or community angles (airshows, festivals, local businesses)

CONTENT STRATEGY: Build narrative complexity with layered revelations and strong regional identity.

REQUIREMENTS:
- Create exactly 10-12 slides from the article
- Slide 1 (Hook): ≤15 words - Most compelling buried angle with psychological triggers
- Slide 2 (Background): ≤25 words - Set context with authority and credibility cues PLUS regional reference
- Slides 3-6: ≤30 words each - Layer multiple hidden angles with emotional resonance
- Slides 7-9: ≤35 words each - Analysis of buried implications with social proof
- Slide 10 (Future): ≤35 words - What happens next with urgency
- Final slide: ≤40 words - Strong conclusion, CTA + source attribution

FINAL SLIDE SOURCE FORMAT:
Always end the final slide with proper attribution:
"Summarised from an article in [Publication], by [Author]" (when author available)
OR "Summarised from an article in [Publication]" (when no author)

BEHAVIORAL NUDGES: Leverage loss aversion, social proof, authority, reciprocity, and commitment.
STYLE: Multi-layered investigation revealing hidden complexity and implications with strong regional identity.`;

      default: // tabloid
        return `You are an expert investigative social media content creator who finds sensational buried angles.

CRITICAL: GEOGRAPHIC/REGIONAL CONTEXT MANDATORY
Every story MUST include specific geographic/regional references throughout:
- ALWAYS mention the primary location (city, town, area) by Slide 2
- Include regional context even if not emphasized in original article  
- Connect local landmarks, events, or community relevance where possible
- Use phrases like "In [Location]", "Near [Location]", "[Location] residents", "Off [Location] coast"

SENSATIONAL ANGLE-MINING: Hunt aggressively for:
- Shocking details or statistics buried deeper in the article
- Human interest elements not emphasized in the lead
- Dramatic contrasts, before/after scenarios, or "us vs them" dynamics
- Emotional core or personal stakes hidden in factual reporting
- Exclusive details that competitors might miss or underplay
- Local connections or community impact buried in broader narrative
- Local events, landmarks, or community angles (airshows, festivals, local businesses)

AGGRESSIVE FILTERING: For TABLOID format, prioritize:
- Dramatic revelation over standard information
- Emotional impact over neutral facts
- Community relevance over generic context
- Personal stakes over institutional angles

REQUIREMENTS:
- Create exactly 8 slides from the article
- Slide 1 (Hook): ≤15 words - Most dramatic buried angle with shock value
- Slide 2 (Context): ≤20 words - Set the scene with local connection and social proof PLUS regional reference
- Slides 3-5: ≤30 words each - Build tension with dramatic contrasts and hidden conflicts
- Slides 6-7: ≤35 words each - Impact with authority figures and community stakes
- Final slide: ≤40 words - Strong takeaway, CTA + source attribution

FINAL SLIDE SOURCE FORMAT:
Always end the final slide with proper attribution:
"Summarised from an article in [Publication], by [Author]" (when author available)
OR "Summarised from an article in [Publication]" (when no author)

BEHAVIORAL NUDGES: Use storytelling, emotional contrast, tribal identity, and reciprocity principles.
STYLE: Dramatic investigative storytelling that reveals hidden drama and tension with strong regional identity.`;
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

  const userPrompt = `Transform this article into engaging carousel slides:

TITLE: ${article.title}
AUTHOR: ${article.author || 'Unknown'}
REGION: ${article.region || 'Unknown'}
CATEGORY: ${article.category || 'News'}

CONTENT:
${article.body}

Create slides that capture the essence of this story while being engaging for social media.`;

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