import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ElevenLabs voice options - using Alice for a British female news briefing voice
const VOICE_ID = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice - British accent, female
const MODEL_ID = 'eleven_turbo_v2_5'; // Fastest and most cost-effective

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
    const { roundupId, forceRegenerate = false } = body;

    if (!roundupId) {
      throw new Error('roundupId is required');
    }

    console.log(`🎙️ Generating audio briefing for roundup ${roundupId} (force: ${forceRegenerate})`);

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

    // Build the TTS script from slide data
    const script = buildTTSScript(roundup, topic);
    
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

    console.log(`📝 Generated script (${script.length} chars):\n${script.substring(0, 200)}...`);

    // Character limit to control costs (~2000 chars max)
    const MAX_CHARS = 2000;
    const trimmedScript = script.length > MAX_CHARS 
      ? script.substring(0, MAX_CHARS - 50) + "... That's your briefing. Have a great day!"
      : script;

    // Call ElevenLabs TTS API
    console.log('🔊 Calling ElevenLabs TTS API...');
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
      message: `Audio briefing generated for ${topic.name} ${roundup.roundup_type}`,
      context: {
        roundup_id: roundupId,
        topic_id: topic.id,
        roundup_type: roundup.roundup_type,
        script_length: trimmedScript.length,
        audio_size_bytes: audioBuffer.byteLength,
        audio_url: publicUrl,
      },
    }).then(() => {}).catch(console.warn);

    console.log(`✅ Audio briefing complete: ${roundupId}`);

    return new Response(JSON.stringify({
      success: true,
      audio_url: publicUrl,
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
 * Build a natural-sounding TTS script from roundup slide data
 */
function buildTTSScript(roundup: Roundup, topic: Topic): string {
  const slides = roundup.slide_data || [];
  const isDaily = roundup.roundup_type === 'daily';
  
  // Format date naturally
  const periodDate = new Date(roundup.period_start);
  const dayName = periodDate.toLocaleDateString('en-GB', { weekday: 'long' });
  const monthDay = periodDate.toLocaleDateString('en-GB', { month: 'long', day: 'numeric' });
  
  const lines: string[] = [];
  
  // Intro
  if (isDaily) {
    lines.push(`Good morning! Here's your ${topic.name} news for ${dayName}, ${monthDay}.`);
  } else {
    lines.push(`Hello! Here's your weekly ${topic.name} roundup.`);
  }
  
  lines.push(''); // Pause
  
  // Extract story headlines from slide data
  const storySlides = slides.filter(s => s.type === 'story_preview');
  
  if (storySlides.length === 0) {
    lines.push("There are no stories to report today.");
  } else if (storySlides.length === 1) {
    lines.push("Today's top story:");
    lines.push(cleanHeadline(storySlides[0].content));
  } else {
    // Multiple stories
    const ordinals = ['First up', 'Next', 'Also today', 'And finally', 'Plus'];
    
    storySlides.slice(0, 5).forEach((slide, index) => {
      const prefix = index < ordinals.length ? ordinals[index] : 'Also';
      const headline = cleanHeadline(slide.content);
      
      // Add source attribution if available
      const source = slide.publication_name || slide.author;
      if (source && index < 3) {
        lines.push(`${prefix}: ${headline}. From ${source}.`);
      } else {
        lines.push(`${prefix}: ${headline}.`);
      }
    });
    
    if (storySlides.length > 5) {
      lines.push(`Plus ${storySlides.length - 5} more ${storySlides.length - 5 === 1 ? 'story' : 'stories'} in your feed.`);
    }
  }
  
  lines.push(''); // Pause
  
  // Outro
  lines.push("That's your briefing. Have a great day!");
  
  return lines.join('\n');
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
