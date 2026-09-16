/**
 * Topic-aware house style presets.
 * Each preset is a ready-made instruction saved to topics.house_style_notes.
 * The owner can always switch to "Your own description" and write their own.
 */

export interface HouseStylePreset {
  id: string;
  label: string;
  text: string;
}

export const CUSTOM_HOUSE_STYLE = 'custom';

interface HouseStyleContext {
  name?: string;
  topicType?: 'regional' | 'keyword' | string;
  region?: string | null;
}

export function getHouseStylePresets({ name, topicType, region }: HouseStyleContext): HouseStylePreset[] {
  const place = (region || name || 'the area').trim();
  const subject = (name || 'this subject').trim();
  const regional = topicType !== 'keyword';

  const shared: HouseStylePreset[] = [
    {
      id: 'plain_local',
      label: 'Plain and factual',
      text: `Plain, dry and factual. Short sentences. Say what happened, where and when. No cheerleading, no adjectives doing the work of facts.`,
    },
    {
      id: 'warm_community',
      label: 'Warm and neighbourly',
      text: `Warm and neighbourly, like telling someone on the bus. Friendly but never gushing. Explain why it matters to people who live here.`,
    },
    {
      id: 'broadsheet',
      label: 'Measured broadsheet',
      text: `Measured broadsheet reporting. Balanced framing, attribution for every claim, context in the second or third sentence. Restrained tone throughout.`,
    },
    {
      id: 'brisk_briefing',
      label: 'Brisk briefing',
      text: `Brisk briefing style. Lead with the outcome, then the detail. Tight paragraphs, no throat-clearing, nothing padded.`,
    },
    {
      id: 'explainer',
      label: 'Explain it simply',
      text: `Explain things simply for someone new to ${subject}. Unpack jargon the first time it appears. Assume interest, not expertise.`,
    },
  ];

  if (regional) {
    shared.splice(1, 0, {
      id: 'local_paper',
      label: `Local paper for ${place}`,
      text: `Write like a trusted local paper in ${place}. Name the street, the venue and the people involved. Keep it grounded in what readers can see for themselves.`,
    });
  } else {
    shared.splice(1, 0, {
      id: 'specialist',
      label: `Specialist coverage of ${subject}`,
      text: `Specialist coverage of ${subject} for a knowledgeable readership. Assume the basics are understood, focus on what is new and why it changes things.`,
    });
  }

  return shared;
}

export function matchPreset(presets: HouseStylePreset[], value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  const found = presets.find((preset) => preset.text.trim() === value.trim());
  return found ? found.id : CUSTOM_HOUSE_STYLE;
}
