// run with: bun test ./src/components/events/social/posterLayout.test.ts
import { describe, expect, it } from "bun:test";
import { H, SAFE, TILE, TITLE_MAX_LINES, W, posterLayout, titleSize } from "./posterLayout";

describe("event poster stays clear of Instagram's furniture", () => {
  for (const title of ["Fado", "Lisbon Jazz Festival at the Coliseu", "A very long event name that keeps going and going well past seventy characters"]) {
    const size = titleSize(title);
    for (let lines = 1; lines <= TITLE_MAX_LINES; lines++) {
      const l = posterLayout(lines, size);
      it(`${size}px, ${lines} line(s): nothing in the top 250px or bottom 420px`, () => {
        expect(l.tileY).toBeGreaterThanOrEqual(SAFE.top);
        expect(l.baselines[l.baselines.length - 1]! + size * 0.22).toBeLessThanOrEqual(H - SAFE.bottom);
      });
      it(`${size}px, ${lines} line(s): the calendar tile never overlaps the title`, () => {
        expect(l.tileY + TILE.h).toBeLessThan(l.titleTop);
      });
    }
  }
  it("text and tile stay out of the right-hand button column", () => {
    const l = posterLayout(2, 92);
    expect(l.tileX + TILE.w).toBeLessThanOrEqual(W - SAFE.right);
    expect(l.tileX + l.textWidth).toBe(W - SAFE.right);
  });
});
