// Editorial variety for story pictures (Illustration module).
// Each story gets a shot and, for people the story doesn't identify, a cast —
// picked deterministically from the story id so regenerating keeps the brief
// stable while a run of stories varies. Pure; no I/O.

export interface PictureBrief {
  shot: string;
  cast: string;
}

export const SHOTS: readonly string[] = [
  'a wide establishing view of the place, people small within it or absent',
  'a close-up of one telling object or detail from the story, no people or only hands',
  'a high overhead view looking down on the scene',
  'a group of several people doing something together, no single hero figure',
  'a low-angle view looking up at a building, structure or landmark',
  'an empty street, room or landscape that shows the story through its setting alone',
  'a centred, symmetrical composition with the main subject in the middle',
  'an over-the-shoulder view, looking past someone at what they are looking at',
  'a mid-distance scene of everyday life where the story is happening, with a few people at different depths',
  'a still life of the objects the story is about, arranged on a surface',
  'a view through a window, doorway or gap that frames the scene',
  'hands at work, in close-up, doing the action at the heart of the story',
];

const AGES = ['in their 20s', 'in their 30s', 'middle-aged', 'in their 60s', 'elderly', 'a teenager'];
const GENDERS = ['a woman', 'a man', 'a woman', 'a man', 'a person'];
const HERITAGE = ['Black British', 'South Asian', 'white British', 'East Asian', 'mixed heritage', 'Middle Eastern', 'white', 'Black African'];
const BUILDS = ['slight', 'broad', 'tall', 'short and stocky', 'average build', 'uses a wheelchair'];

function hash(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T>(list: readonly T[], seed: string, salt: number): T => list[hash(seed, salt) % list.length]!;

export function pictureBrief(seed: string): PictureBrief {
  const shot = pick(SHOTS, seed, 1);
  const cast = `${pick(GENDERS, seed, 2)} ${pick(AGES, seed, 3)}, ${pick(HERITAGE, seed, 4)}, ${pick(BUILDS, seed, 5)}`;
  return { shot, cast };
}

/** Instruction for the scene writer: framing plus who to cast when the story names nobody. */
export function sceneDirection(brief: PictureBrief): string {
  return `EDITORIAL VARIETY (follow unless the story makes it impossible):
- Frame this story as ${brief.shot}.
- People are optional. Never default to one person standing on one side of the frame with scenery behind them.
- If the story names or clearly describes a person, describe them as the story does. If it doesn't and a person is needed, cast them as ${brief.cast}. Add others of different ages, genders and backgrounds only where a group fits.`;
}

/** Short block appended to the artist prompt so the composition rule survives the style text. */
export function compositionRule(brief: PictureBrief): string {
  return `\nCOMPOSITION FOR THIS PICTURE: ${brief.shot}. Avoid the stock layout of a single figure in the foreground on one side with a background scene behind. Vary scale, viewpoint and where the subject sits in the frame.\n`;
}
