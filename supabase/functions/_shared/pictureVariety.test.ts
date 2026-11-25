import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pictureBrief, SHOTS } from "./pictureVariety.ts";

Deno.test("same story keeps the same brief", () => {
  assertEquals(pictureBrief("story-abc"), pictureBrief("story-abc"));
});

Deno.test("a run of 10 stories uses at least 4 different shots", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 10; i++) {
    const { shot } = pictureBrief(crypto.randomUUID());
    counts.set(shot, (counts.get(shot) ?? 0) + 1);
  }
  // Random ids: allow slack but catch a collapsed picker.
  assert(counts.size >= 4, `only ${counts.size} shots`);
});

Deno.test("over 200 stories every shot appears and casts vary", () => {
  const shots = new Set<string>(); const casts = new Set<string>();
  for (let i = 0; i < 200; i++) { const b = pictureBrief(`s-${i}`); shots.add(b.shot); casts.add(b.cast); }
  assertEquals(shots.size, SHOTS.length);
  assert(casts.size > 100);
  assertNotEquals(pictureBrief("s-1").cast, pictureBrief("s-2").cast);
});
