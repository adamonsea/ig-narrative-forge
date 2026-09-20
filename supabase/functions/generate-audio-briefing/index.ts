import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isServiceRole, unauthorized } from '../_shared/auth.ts';

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
  created_by: string;
  audio_briefings_daily_enabled: boolean;
  audio_briefings_weekly_enabled: boolean;
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

/** Unified rate card: 30 credits per audio briefing (~50% margin). */
const AUDIO_BRIEFING_CREDITS = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Audio generation is an internal operation invoked by roundup jobs.
  if (!isServiceRole(req)) return unauthorized(corsHeaders);

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

  let creditsReserved = false;
  let creditOwnerId: string | null = null;
  let creditKey: string | null = null;

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
      .select('*, topics!inner(id, name, slug, created_by, audio_briefings_daily_enabled, audio_briefings_weekly_enabled)')
      .eq('id', roundupId)
      .single();

    if (roundupError || !roundup) {
      throw new Error(`Roundup not found: ${roundupError?.message}`);
    }

    const topic = roundup.topics as unknown as Topic;
    const audioEnabled = roundup.roundup_type === 'daily'
      ? topic.audio_briefings_daily_enabled
      : topic.audio_briefings_weekly_enabled;
    const { data: hasPro } = await supabase.rpc('has_pro_access', { p_user_id: topic.created_by });
    if (!audioEnabled || !hasPro) {
      return new Response(JSON.stringify({ success: false, error: 'Audio briefing is not available.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Reserve credits from the feed owner (rate card: 30 credits per briefing)
    const reservationKey = `audio_briefing:${roundupId}:${style}`;
    creditOwnerId = topic.created_by;
    creditKey = reservationKey;
    const { data: reservation, error: reservationError } = await supabase.rpc('reserve_user_credits', {
      p_user_id: topic.created_by,
      p_amount: AUDIO_BRIEFING_CREDITS,
      p_idempotency_key: reservationKey,
      p_description: `Audio briefing (${style}) for ${topic.name}`,
      p_story_id: null,
    });
    if (reservationError || !reservation?.success) {
      console.error('❌ Credit reservation failed:', reservationError?.message || reservation?.error);
      return new Response(JSON.stringify({
        success: false,
        error: reservation?.error || 'Not enough credits for an audio briefing.',
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    creditsReserved = true;

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

    const { data: settlement, error: settlementError } = await supabase.rpc('settle_credit_reservation', {
      p_user_id: topic.created_by,
      p_idempotency_key: reservationKey,
    });
    if (settlementError || !settlement?.success) {
      console.error('⚠️ Credit settlement failed:', settlementError?.message || settlement?.error);
    }
    creditsReserved = false;

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

    if (creditsReserved && creditOwnerId && creditKey) {
      await supabase.rpc('release_credit_reservation', {
        p_user_id: creditOwnerId,
        p_idempotency_key: creditKey,
      });
    }
    
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
  
  // Use the actual total story count from roundup stats, not just the slide count
  const totalStories = (roundup.stats as { story_count?: number })?.story_count || storySlides.length;
  const previewedCount = storySlides.length;
  
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
    
    // Always mention the total story count when there are stories
    if (totalStories > 0) {
      lines.push(`We've got ${totalStories} ${totalStories === 1 ? 'story' : 'stories'} this week, but let me highlight the ones you engaged with most.`);
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
    const remaining = totalStories - Math.min(mentionedCount, previewedCount);
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
 * Protect abbreviations and initials from being treated as sentence endings
 */
function protectAbbreviations(text: string): string {
  // Common abbreviations
  const abbreviations = [
    'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Rev', 'Sr', 'Jr', 'St', 'Mt',
    'vs', 'etc', 'i.e', 'e.g', 'a.m', 'p.m', 'Inc', 'Ltd', 'Co', 'Corp',
    'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  
  let protected_text = text;
  
  // Protect common abbreviations (Mr. Mrs. Dr. etc.)
  abbreviations.forEach(abbr => {
    const regex = new RegExp(`\\b${abbr}\\.`, 'gi');
    protected_text = protected_text.replace(regex, `${abbr}‧`); // Use middle dot as placeholder
  });
  
  // Protect initials like A.A., J.K., U.S., U.K. (single letter followed by period)
  // This handles patterns like "A.A. Milne" or "J.K. Rowling"
  protected_text = protected_text.replace(/\b([A-Z])\.([A-Z])\./g, '$1‧$2‧');
  protected_text = protected_text.replace(/\b([A-Z])\.\s(?=[A-Z])/g, '$1‧ ');
  
  // Protect numbers with decimals (e.g., "3.5 million")
  protected_text = protected_text.replace(/(\d)\.(\d)/g, '$1‧$2');
  
  return protected_text;
}

/**
 * Restore protected abbreviations back to normal periods
 */
function restoreAbbreviations(text: string): string {
  return text.replace(/‧/g, '.');
}

/**
 * Extract the first sentence from a caption
 */
function extractFirstSentence(caption: string): string | null {
  if (!caption) return null;
  
  // Remove emojis and clean up
  let cleaned = caption.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Protect abbreviations before sentence detection
  const protected_text = protectAbbreviations(cleaned);
  
  // Find first sentence (ending with . ! or ? followed by space and capital, or end of string)
  const match = protected_text.match(/^[^.!?]+[.!?](?=\s+[A-Z]|$)/);
  if (match) {
    return restoreAbbreviations(match[0].trim());
  }
  
  // Fallback: simple split on sentence-ending punctuation
  const simpleSplit = protected_text.match(/^[^.!?]+[.!?]/);
  if (simpleSplit) {
    return restoreAbbreviations(simpleSplit[0].trim());
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
  
  // Protect abbreviations before sentence detection
  const protected_text = protectAbbreviations(cleaned);
  
  // Split into sentences - look for punctuation followed by space and capital letter
  const sentences = protected_text.match(/[^.!?]+[.!?]+(?=\s+[A-Z]|$)/g);
  if (!sentences || sentences.length === 0) {
    // Fallback to simple split
    const simpleSentences = protected_text.match(/[^.!?]+[.!?]+/g);
    if (!simpleSentences || simpleSentences.length === 0) {
      return cleaned.length > 200 ? cleaned.substring(0, 200).trim() + '.' : cleaned;
    }
    const selected = simpleSentences.slice(0, maxSentences);
    return restoreAbbreviations(selected.join(' ').trim());
  }
  
  // Take up to maxSentences
  const selected = sentences.slice(0, maxSentences);
  return restoreAbbreviations(selected.join(' ').trim());
}
