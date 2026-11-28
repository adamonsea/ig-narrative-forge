/** Editorial lengths for new summaries. Shared by workspace and writer. */
export type FeedStoryLength = 'brief' | 'standard' | 'indepth' | 'extensive';
export const STORY_LENGTHS = [
  { value: 'brief', label: 'Brief', slides: 3, bodyWords: 40 },
  { value: 'standard', label: 'Standard', slides: 5, bodyWords: 37 },
  { value: 'indepth', label: 'In-depth', slides: 7, bodyWords: 40 },
  { value: 'extensive', label: 'Extended', slides: 12, bodyWords: 40 },
] as const;
const LEGACY_LENGTHS: Record<string, number> = { short: 4, tabloid: 6, indepth: 8, extensive: 12 };
export function storyLengthRules(feedLength: unknown, override?: string | null, snippet = false) {
  const preset = STORY_LENGTHS.find(p => p.value === feedLength) ?? STORY_LENGTHS[1];
  const inherited = !override || override === 'feed';
  const slides = inherited ? preset.slides : LEGACY_LENGTHS[override] ?? preset.slides;
  const limit = snippet ? Math.min(slides, 3) : slides;
  return {
    slides: limit,
    bodyWords: inherited ? preset.bodyWords : 40,
    slideType: inherited ? ({ brief: 'short', standard: 'tabloid', indepth: 'indepth', extensive: 'extensive' } as const)[preset.value] : override ?? 'tabloid',
  };
}
export function withinStoryLength(slides: readonly { content: string }[], count: number, bodyWords: number) {
  return slides.length <= count && slides.every((slide, i) => i === 0 || slide.content.trim().split(/\s+/).filter(Boolean).length <= bodyWords);
}
