// @ts-nocheck -- run with: bun test ./src/lib/eventPhotoPath.test.ts
import { describe, expect, it } from 'bun:test';
import { isStoredEventPhoto } from './eventPhotoPath';

const T = '11111111-2222-3333-4444-555555555555';
const E = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('isStoredEventPhoto', () => {
  it("accepts only Curatr's stored copies in a feed's events folder", () => {
    expect(isStoredEventPhoto(`${T}/events/${E}.webp`)).toBe(true);
    expect(isStoredEventPhoto(`${T}/events/${E}.jpg`)).toBe(true);
  });
  it('never accepts an outside image address or another folder', () => {
    expect(isStoredEventPhoto('https://www.agendalx.pt/content/uploads/bike.jpg')).toBe(false);
    expect(isStoredEventPhoto(`${T}/logo/${E}.webp`)).toBe(false);
    expect(isStoredEventPhoto(null)).toBe(false);
  });
});
