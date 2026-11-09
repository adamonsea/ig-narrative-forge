// @ts-nocheck -- run with: bun test ./src/lib/slideTextFit.test.ts
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FIT_FONT_WEIGHT, FIT_TEXT_CLASS, FIT_TEXT_STYLE, FIT_LINE_HEIGHT } from './slideTextFit';

describe('body slide text (slides 2+)', () => {
  it('uses Lexend', () => {
    expect(FIT_TEXT_CLASS.split(' ')).toContain('font-lexend');
  });

  it('uses a Lexend weight that index.html actually loads (no faked weight)', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const m = html.match(/family=Lexend:wght@([\d;]+)/);
    expect(m).not.toBeNull();
    expect(m[1].split(';').map(Number)).toContain(FIT_FONT_WEIGHT);
  });

  it('renders and measures with the same line height', () => {
    expect(FIT_TEXT_STYLE.lineHeight).toBe(String(FIT_LINE_HEIGHT));
    expect(FIT_TEXT_STYLE.fontWeight).toBe(FIT_FONT_WEIGHT);
  });
});
