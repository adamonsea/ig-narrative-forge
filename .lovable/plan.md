

# Audio Briefings Infrastructure Plan

## Overview

This plan implements the infrastructure for audio briefings as a premium feature, enabling curators to offer TTS-generated audio versions of their daily and weekly roundups. The system uses ElevenLabs for text-to-speech generation with caching to minimize costs.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         Topic Settings                              │
│  ┌──────────────────┐  ┌──────────────────┐                        │
│  │ Audio Daily:  ON │  │ Audio Weekly: ON │  (Premium toggles)      │
│  └──────────────────┘  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   generate-audio-briefing Edge Function             │
│  • Compiles story headlines into TTS script                        │
│  • Calls ElevenLabs API (eleven_turbo_v2_5 model)                  │
│  • Stores MP3 in Supabase Storage                                  │
│  • Updates topic_roundups.audio_url                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Feed User UI                                │
│  ┌─────────────────────────────────────────────────────┐           │
│  │  Daily Briefing - Jan 15                   🔊 Play  │           │
│  │  ───────────────────────────────────────────────── │           │
│  │  [Audio player with play/pause/progress controls]  │           │
│  └─────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Database Schema Changes

Add premium feature toggles to the `topics` table and audio storage to roundups:

**Topics table additions:**
- `audio_briefings_daily_enabled` (boolean, default false) - Premium toggle for daily audio
- `audio_briefings_weekly_enabled` (boolean, default false) - Premium toggle for weekly audio

**Topic roundups table additions:**
- `audio_url` (text, nullable) - URL to the generated MP3 file in Supabase Storage
- `audio_generated_at` (timestamptz, nullable) - When audio was last generated
- `audio_script` (text, nullable) - The script used for TTS (for debugging/regeneration)

### 2. Supabase Storage Bucket

Create a new storage bucket `audio-briefings` with:
- Public read access for playback
- Organized by `{topic_slug}/{roundup_type}/{date}.mp3`
- CORS headers for cross-origin audio playback

### 3. Edge Function: `generate-audio-briefing`

Core function that generates audio from roundup content:

**Input:**
```json
{
  "roundupId": "uuid",
  "forceRegenerate": false
}
```

**Logic:**
1. Fetch roundup with story data
2. Check if audio already exists (skip if not forcing)
3. Compile script from story headlines and summaries
4. Call ElevenLabs API with `eleven_turbo_v2_5` model
5. Stream response to Supabase Storage
6. Update `topic_roundups.audio_url`

**Script format example:**
```
Good morning! Here's your Eastbourne news for Monday, February 3rd.

First up: Council approves new seafront development.
Next: Local charity raises £50,000 for children's hospital.
And finally: Storm warning issued for this weekend.

That's your briefing. Have a great day!
```

**Cost optimizations:**
- Use `eleven_turbo_v2_5` (~$0.11/1K chars) - fastest and cheapest
- Cache audio indefinitely (roundup content doesn't change)
- Skip generation if audio already exists
- Character count limit per briefing (~2,000 chars max)

### 4. Integration with Roundup Generation

Modify `generate-daily-roundup` and `generate-weekly-roundup` to:
- Check if audio is enabled for the topic
- Trigger audio generation after roundup is created
- Log audio generation in system_logs

### 5. Topic Dashboard UI (Curator)

Add toggles in the "Distribution Channels" section alongside RSS and Email:

**Location:** `src/pages/TopicDashboard.tsx` lines 959-1008

**New toggles:**
- Audio Daily Briefings (ON/OFF) with "Premium" badge
- Audio Weekly Briefings (ON/OFF) with "Premium" badge

Each toggle shows:
- Character count estimate
- Approximate cost per generation
- Link to test/preview audio

### 6. Feed User UI Components

**BriefingsArchive.tsx updates:**
- Show audio player icon on cards where audio exists
- Inline audio player that expands on click

**DailyRoundupList.tsx / WeeklyRoundupList.tsx updates:**
- Add audio player in header when audio_url exists
- Simple play/pause with scrubber
- Download button for offline listening

**New component: `AudioBriefingPlayer.tsx`**
- Minimal audio player component
- Handles loading states
- Mobile-optimized controls
- Respects prefers-reduced-motion

### 7. Secret Requirements

Requires `ELEVENLABS_API_KEY` secret to be added to the project.

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx.sql` | Create | Add columns to topics and topic_roundups |
| `supabase/functions/generate-audio-briefing/index.ts` | Create | Core TTS generation edge function |
| `supabase/functions/generate-daily-roundup/index.ts` | Edit | Trigger audio generation if enabled |
| `supabase/functions/generate-weekly-roundup/index.ts` | Edit | Trigger audio generation if enabled |
| `src/pages/TopicDashboard.tsx` | Edit | Add audio briefing toggles |
| `src/pages/BriefingsArchive.tsx` | Edit | Show audio availability indicators |
| `src/pages/DailyRoundupList.tsx` | Edit | Add audio player in header |
| `src/pages/WeeklyRoundupList.tsx` | Edit | Add audio player in header |
| `src/components/AudioBriefingPlayer.tsx` | Create | Reusable audio player component |
| `src/integrations/supabase/types.ts` | Auto-update | TypeScript types for new columns |

## Cost Considerations

Based on the analysis:
- Daily briefing: ~800 characters = ~$0.09
- Weekly briefing: ~1,600 characters = ~$0.18
- Monthly per topic (daily + weekly): ~$3.42
- Annual per topic: ~$41

The premium toggle allows curators to opt-in based on their subscription level.

## Future Enhancements (Not in scope)

- Voice selection per topic (different ElevenLabs voices)
- Multi-language audio briefings
- Podcast RSS feed generation
- Auto-publish to podcast platforms

