import { describe, it, expect } from 'vitest';
import { storyLengthRules, withinStoryLength } from '@/lib/storyLength';
describe('Feed story lengths', () => {
  it('Snapshot is a headline and one summary slide', () => {
    expect(storyLengthRules('snapshot')).toMatchObject({ slides: 2, bodyWords: 45 });
  });
  it('unknown feed lengths fall back to the five-slide default', () => {
    expect(storyLengthRules('nonsense').slides).toBe(5);
  });
  it('Brief is a headline and two takeaways, at most 80 body words', () => {
    expect(storyLengthRules('brief')).toMatchObject({ slides: 3, bodyWords: 40 });
  });
  it('Standard is a headline and four body slides, at most 148 body words', () => {
    expect(storyLengthRules('standard')).toMatchObject({ slides: 5, bodyWords: 37 });
  });
  it('In-depth is a headline and six body slides, at most 240 body words', () => {
    expect(storyLengthRules('indepth')).toMatchObject({ slides: 7, bodyWords: 40 });
  });
  it('retains extended control for owners of their own content', () => {
    expect(storyLengthRules('extensive').slides).toBe(12);
    expect(storyLengthRules('brief', 'extensive').slides).toBe(12);
  });
  it('per-story choices take precedence over feed defaults', () => {
    expect(storyLengthRules('brief', 'tabloid').slides).toBe(6);
    expect(storyLengthRules('indepth', 'short').slides).toBe(4);
    expect(storyLengthRules('standard', 'indepth').slides).toBe(8);
  });
  it('feed choice inherits the current saved setting', () => {
    expect(storyLengthRules('brief', 'feed').slides).toBe(3);
    expect(storyLengthRules('indepth', 'feed').slides).toBe(7);
  });
  it('does not expand snippets beyond three slides', () => {
    expect(storyLengthRules('extensive', 'extensive', true).slides).toBe(3);
    expect(storyLengthRules('brief', 'feed', true).slides).toBe(3);
  });
  it('rejects overlong body text without chopping the source', () => {
    expect(withinStoryLength([{content:'Headline'}, {content:'word '.repeat(41)}],3,40)).toBe(false);
    expect(withinStoryLength([{content:'Headline'}, {content:'word '.repeat(40)}],3,40)).toBe(true);
    expect(withinStoryLength(Array.from({length:4},()=>({content:'A fact.'})),3,40)).toBe(false);
  });
});
