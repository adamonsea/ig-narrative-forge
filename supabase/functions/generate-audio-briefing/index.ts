import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ElevenLabs voice options - using Alice for a British female news briefing voice
const VOICE_ID = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice - British accent, female
const MODEL_ID = 'eleven_turbo_v2_5'; // Fastest and most cost-effective

// Briefing style character limits
const BRIEFING_LIMITS = {
  quick: 800,        // ~20 seconds, headlines only
  standard: 1500,    // ~1 minute, headlines + brief context
  comprehensive: 2400, // ~2 minutes, detailed with summaries
};

type BriefingStyle = 'quick' | 'standard' | 'comprehensive';

interface RoundupSlide {
  type: string;
  content: string;
  story_id?: string;
  author?: string;
  publication_name?: string;
}

interface Topic {
  id: string;
  name: string;
  slug: string;
}

interface Roundup {
  id: string;
  topic_id: string;
  roundup_type: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
  slide_data: RoundupSlide[];
  audio_url?: string;
  audio_generated_at?: string;
}

interface StoryWithCaption {
  story_id: string;
  title: string;
  publication_name: string | null;
  author: string | null;
  caption: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
  
  if (!elevenLabsApiKey) {
    console.error('❌ ELEVENLABS_API_KEY not configured');
    return new Response(JSON.stringify({
      success: false,
      error: 'ELEVENLABS_API_KEY not configured'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { 
      roundupId, 
      forceRegenerate = false,
      briefingStyle = 'comprehensive' // Default to comprehensive for richer content
    } = body;

    if (!roundupId) {
      throw new Error('roundupId is required');
    }

    // Validate briefing style
    const style: BriefingStyle = ['quick', 'standard', 'comprehensive'].includes(briefingStyle) 
      ? briefingStyle as BriefingStyle 
      : 'comprehensive';

    console.log(`🎙️ Generating ${style} audio briefing for roundup ${roundupId} (force: ${forceRegenerate})`);

    // Fetch roundup with topic info
    const { data: roundup, error: roundupError } = await supabase
      .from('topic_roundups')
      .select('*, topics!inner(id, name, slug)')
      .eq('id', roundupId)
      .single();

    if (roundupError || !roundup) {
      throw new Error(`Roundup not found: ${roundupError?.message}`);
    }

    const topic = roundup.topics as unknown as Topic;

    // Check if audio already exists (skip if not forcing regeneration)
    if (roundup.audio_url && !forceRegenerate) {
      console.log('⏭️ Audio already exists, skipping generation');
      return new Response(JSON.stringify({
        success: true,
        message: 'Audio already exists',
        audio_url: roundup.audio_url,
        skipped: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract story IDs from slide data
    const slides = roundup.slide_data || [];
    const storySlides = slides.filter((s: RoundupSlide) => s.type === 'story_preview');
    const storyIds = storySlides
      .map((s: RoundupSlide) => s.story_id)
      .filter(Boolean) as string[];

    // Fetch rich content for stories (captions from story_social_content)
    let storiesWithCaptions: StoryWithCaption[] = [];
    
    if (storyIds.length > 0 && style !== 'quick') {
      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          publication_name,
          author,
          story_social_content(caption)
        `)
        .in('id', storyIds);

      if (!storyError && storyData) {
        storiesWithCaptions = storyData.map((s: any) => ({
          story_id: s.id,
          title: s.title,
          publication_name: s.publication_name,
          author: s.author,
          caption: s.story_social_content?.[0]?.caption || null,
        }));
      }
      console.log(`📚 Fetched ${storiesWithCaptions.length} stories with captions`);
    }

    // Build the TTS script based on style
    const script = buildEnhancedTTSScript(roundup, topic, storySlides, storiesWithCaptions, style);
    
    if (!script || script.length < 50) {
      console.log('⏭️ Script too short, skipping audio generation');
      return new Response(JSON.stringify({
        success: false,
        message: 'Script too short to generate audio',
        script_length: script?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📝 Generated ${style} script (${script.length} chars):\n${script.substring(0, 300)}...`);

    // Apply character limit based on briefing style
    const maxChars = BRIEFING_LIMITS[style];
    const trimmedScript = script.length > maxChars 
      ? script.substring(0, maxChars - 50) + "... That's your briefing. Have a great day!"
      : script;

    // Call ElevenLabs TTS API
    console.log(`🔊 Calling ElevenLabs TTS API (${trimmedScript.length} chars)...`);
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: trimmedScript,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      throw new Error(`ElevenLabs API error [${ttsResponse.status}]: ${errorText}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    console.log(`✅ Audio generated: ${audioBuffer.byteLength} bytes`);

    // Upload to Supabase Storage
    const dateStr = new Date(roundup.period_start).toISOString().split('T')[0];
    const fileName = `${topic.slug}/${roundup.roundup_type}/${dateStr}.mp3`;
    
    console.log(`📤 Uploading to storage: ${fileName}`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-briefings')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload error: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('audio-briefings')
      .getPublicUrl(fileName);

    console.log(`📎 Public URL: ${publicUrl}`);

    // Update roundup with audio URL
    const { error: updateError } = await supabase
      .from('topic_roundups')
      .update({
        audio_url: publicUrl,
        audio_generated_at: new Date().toISOString(),
        audio_script: trimmedScript,
      })
      .eq('id', roundupId);

    if (updateError) {
      throw new Error(`Failed to update roundup: ${updateError.message}`);
    }

    // Log to system_logs for tracking
    await supabase.from('system_logs').insert({
      log_type: 'audio_briefing_generated',
      message: `Audio briefing (${style}) generated for ${topic.name} ${roundup.roundup_type}`,
      context: {
        roundup_id: roundupId,
        topic_id: topic.id,
        roundup_type: roundup.roundup_type,
        briefing_style: style,
        script_length: trimmedScript.length,
        audio_size_bytes: audioBuffer.byteLength,
        audio_url: publicUrl,
      },
    }).then(() => {}).catch(console.warn);

    console.log(`✅ Audio briefing (${style}) complete: ${roundupId}`);

    return new Response(JSON.stringify({
      success: true,
      audio_url: publicUrl,
      briefing_style: style,
      script_length: trimmedScript.length,
      audio_size_bytes: audioBuffer.byteLength,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Audio briefing generation error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Build an enhanced TTS script based on briefing style
 */
function buildEnhancedTTSScript(
  roundup: Roundup, 
  topic: Topic, 
  storySlides: RoundupSlide[],
  storiesWithCaptions: StoryWithCaption[],
  style: BriefingStyle
): string {
  const isDaily = roundup.roundup_type === 'daily';
  
  // Format date naturally
  const periodDate = new Date(roundup.period_start);
  const dayName = periodDate.toLocaleDateString('en-GB', { weekday: 'long' });
  const monthDay = periodDate.toLocaleDateString('en-GB', { month: 'long', day: 'numeric' });
  
  // Create a map for quick caption lookup
  const captionMap = new Map<string, StoryWithCaption>();
  storiesWithCaptions.forEach(s => captionMap.set(s.story_id, s));
  
  const lines: string[] = [];
  const totalStories = storySlides.length;
  
  // Intro based on style
  if (style === 'quick') {
    if (isDaily) {
      lines.push(`Good morning! Here's your ${topic.name} news for ${dayName}.`);
    } else {
      lines.push(`Hello! Here's your weekly ${topic.name} roundup.`);
    }
  } else {
    if (isDaily) {
      lines.push(`Good morning! Here's your ${topic.name} news briefing for ${dayName}, ${monthDay}.`);
    } else {
      lines.push(`Hello! Here's your weekly ${topic.name} roundup for the week of ${monthDay}.`);
    }
    
    if (totalStories > 5) {
      lines.push(`We've got ${totalStories} stories to share, but let me highlight the most important ones.`);
    }
  }
  
  lines.push(''); // Pause
  
  if (storySlides.length === 0) {
    lines.push("There are no stories to report today.");
  } else {
    // Different content depth based on style
    switch (style) {
      case 'quick':
        buildQuickScript(lines, storySlides, captionMap);
        break;
      case 'standard':
        buildStandardScript(lines, storySlides, captionMap);
        break;
      case 'comprehensive':
        buildComprehensiveScript(lines, storySlides, captionMap);
        break;
    }
    
    // Mention remaining stories if there are more
    const mentionedCount = style === 'quick' ? 5 : style === 'standard' ? 5 : 5;
    const remaining = totalStories - Math.min(mentionedCount, storySlides.length);
    if (remaining > 0) {
      lines.push(`Plus ${remaining} more ${remaining === 1 ? 'story' : 'stories'} in your feed.`);
    }
  }
  
  lines.push(''); // Pause
  
  // Outro
  if (isDaily) {
    lines.push("That's your briefing. Have a great day!");
  } else {
    lines.push("That's your briefing. Have a great week!");
  }
  
  return lines.join('\n');
}

/**
 * Quick style: Headlines only with brief transitions
 */
function buildQuickScript(
  lines: string[], 
  storySlides: RoundupSlide[],
  captionMap: Map<string, StoryWithCaption>
): void {
  const ordinals = ['First up', 'Next', 'Also today', 'And finally', 'Plus'];
  
  storySlides.slice(0, 5).forEach((slide, index) => {
    const prefix = index < ordinals.length ? ordinals[index] : 'Also';
    const headline = cleanHeadline(slide.content);
    lines.push(`${prefix}: ${headline}.`);
  });
}

/**
 * Standard style: Headlines with brief context for top stories
 */
function buildStandardScript(
  lines: string[], 
  storySlides: RoundupSlide[],
  captionMap: Map<string, StoryWithCaption>
): void {
  storySlides.slice(0, 5).forEach((slide, index) => {
    const storyData = slide.story_id ? captionMap.get(slide.story_id) : null;
    const headline = storyData?.title || cleanHeadline(slide.content);
    const source = storyData?.publication_name || slide.publication_name;
    
    if (index === 0) {
      // Lead story with brief context
      lines.push(`Our top story: ${headline}.`);
      
      // Add first sentence of caption if available
      if (storyData?.caption) {
        const firstSentence = extractFirstSentence(storyData.caption);
        if (firstSentence) {
          lines.push(firstSentence);
        }
      }
    } else if (index < 3) {
      // Stories 2-3 with source attribution
      const prefix = index === 1 ? 'Also making news' : 'Meanwhile';
      if (source) {
        lines.push(`${prefix}: ${headline}. From ${source}.`);
      } else {
        lines.push(`${prefix}: ${headline}.`);
      }
    } else {
      // Stories 4-5 brief mention
      const prefix = index === 3 ? 'Also today' : 'And';
      lines.push(`${prefix}: ${headline}.`);
    }
  });
}

/**
 * Comprehensive style: Rich detail with summaries and context
 */
function buildComprehensiveScript(
  lines: string[], 
  storySlides: RoundupSlide[],
  captionMap: Map<string, StoryWithCaption>
): void {
  storySlides.slice(0, 5).forEach((slide, index) => {
    const storyData = slide.story_id ? captionMap.get(slide.story_id) : null;
    const headline = storyData?.title || cleanHeadline(slide.content);
    const source = storyData?.publication_name || slide.publication_name;
    
    if (index === 0) {
      // Lead story with full detail
      lines.push(`Our top story this week: ${headline}.`);
      
      // Add multiple sentences from caption for lead story
      if (storyData?.caption) {
        const summary = extractSummary(storyData.caption, 3); // Up to 3 sentences
        if (summary) {
          lines.push(summary);
        }
      }
      
      if (source) {
        lines.push(`Reported by ${source}.`);
      }
      lines.push(''); // Pause after lead story
      
    } else if (index < 3) {
      // Stories 2-3 with context
      const categoryIntros = [
        'In other news',
        'Also this week',
      ];
      const prefix = categoryIntros[index - 1] || 'Also';
      lines.push(`${prefix}: ${headline}.`);
      
      // Add one sentence of context
      if (storyData?.caption) {
        const context = extractFirstSentence(storyData.caption);
        if (context) {
          lines.push(context);
        }
      }
      
    } else {
      // Stories 4-5 with transitions
      const prefix = index === 3 ? 'Meanwhile' : 'And finally';
      lines.push(`${prefix}: ${headline}.`);
    }
  });
}

/**
 * Clean headline text for TTS
 */
function cleanHeadline(text: string): string {
  if (!text) return '';
  
  // Remove numbering like "#1: " or "1. "
  let cleaned = text.replace(/^#?\d+[:.\s]+/i, '');
  
  // Remove any HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Remove excess whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Ensure it ends cleanly (no trailing punctuation issues)
  cleaned = cleaned.replace(/[.,;:!?]+$/, '');
  
  return cleaned;
}

/**
 * Extract the first sentence from a caption
 */
function extractFirstSentence(caption: string): string | null {
  if (!caption) return null;
  
  // Remove emojis and clean up
  let cleaned = caption.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Find first sentence (ending with . ! or ?)
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  if (match) {
    return match[0].trim();
  }
  
  // If no sentence found, return first 100 chars
  if (cleaned.length > 100) {
    return cleaned.substring(0, 100).trim() + '.';
  }
  
  return cleaned || null;
}

/**
 * Extract a summary (multiple sentences) from a caption
 */
function extractSummary(caption: string, maxSentences: number): string | null {
  if (!caption) return null;
  
  // Remove emojis and clean up
  let cleaned = caption.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Split into sentences
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) {
    return cleaned.length > 200 ? cleaned.substring(0, 200).trim() + '.' : cleaned;
  }
  
  // Take up to maxSentences
  const selected = sentences.slice(0, maxSentences);
  return selected.join(' ').trim();
}
