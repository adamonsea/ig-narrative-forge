/** Editorial lengths for new summaries. Shared by workspace and writer. */
export type FeedStoryLength = 'adaptive' | 'snapshot' | 'brief' | 'standard' | 'indepth' | 'extensive';
export const STORY_LENGTHS = [
  { value: 'adaptive', label: 'Adaptive', slides: 5, bodyWords: 37 },
  { value: 'snapshot', label: 'Snapshot', slides: 2, bodyWords: 45 },
  { value: 'brief', label: 'Brief', slides: 3, bodyWords: 40 },
  { value: 'standard', label: 'Rich', slides: 5, bodyWords: 37 },
  { value: 'indepth', label: 'In-depth', slides: 7, bodyWords: 40 },
  { value: 'extensive', label: 'Extended', slides: 12, bodyWords: 40 },
] as const;
const LEGACY_LENGTHS: Record<string, number> = { short: 4, tabloid: 6, indepth: 8, extensive: 12 };
export interface StorySignals { wordCount?: number; relevance?: number; quality?: number }
/** Adaptive: short source -> Snapshot; long, relevant, well-reported -> Rich; otherwise Brief. Scores are 0-100. */
export function adaptiveStoryLength({ wordCount = 0, relevance = 0, quality = 0 }: StorySignals = {}): 'snapshot' | 'brief' | 'standard' {
  if (wordCount > 0 && wordCount < 250) return 'snapshot';
  if (wordCount >= 500 && relevance >= 70 && quality >= 70) return 'standard';
  return 'brief';
}
export function storyLengthRules(feedLength: unknown, override?: string | null, snippet = false, signals?: StorySignals) {
  const chosen = feedLength === 'adaptive' ? adaptiveStoryLength(signals) : feedLength;
  const preset = STORY_LENGTHS.find(p => p.value === chosen && p.value !== 'adaptive') ?? STORY_LENGTHS[3];
  const inherited = !override || override === 'feed';
  const slides = inherited ? preset.slides : LEGACY_LENGTHS[override] ?? preset.slides;
  const limit = snippet ? Math.min(slides, 3) : slides;
  return {
    slides: limit,
    bodyWords: inherited ? preset.bodyWords : 40,
    slideType: inherited ? ({ adaptive: 'tabloid', snapshot: 'short', brief: 'short', standard: 'tabloid', indepth: 'indepth', extensive: 'extensive' } as const)[preset.value] : override ?? 'tabloid',
  };
}
export function withinStoryLength(slides: readonly { content: string }[], count: number, bodyWords: number) {
  return slides.length <= count && slides.every((slide, i) => i === 0 || slide.content.trim().split(/\s+/).filter(Boolean).length <= bodyWords);
}
