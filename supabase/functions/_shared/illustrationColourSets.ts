// Curated colour sets for illustrations (Illustration module).
// A picture always uses ONE whole set, never colours mixed across sets.
// Pure rules: no I/O, shared with the app via src/lib/illustrationColourSets.ts.

export interface ColourSet { id: string; name: string; colours: string[] }

export const COLOUR_SETS: ColourSet[] = [
  { id: 'tangerine-pistachio', name: 'Tangerine', colours: ['#E3792F', '#E9E9C7', '#30673A'] },
  { id: 'avocado-lemon', name: 'Avocado', colours: ['#568203', '#FFF8B9'] },
  { id: 'peacock-bubblegum', name: 'Peacock', colours: ['#036E79', '#FFB8D0'] },
  { id: 'blossom-peach', name: 'Blossom', colours: ['#AE4948', '#D48354', '#224D41'] },
  { id: 'harbour-lime', name: 'Harbour', colours: ['#285A71', '#CFDA5A', '#FCE4C0'] },
  { id: 'mint-scarlet', name: 'Scarlet', colours: ['#AAD7CD', '#FAFAEB', '#F02300'] },
  { id: 'greyblue-orange', name: 'Dusk', colours: ['#305166', '#E79D56', '#B25781'] },
  { id: 'teal-mustard', name: 'Mustard', colours: ['#0F7476', '#DFAF34'] },
  { id: 'watermelon-mint', name: 'Watermelon', colours: ['#FF7CAC', '#A7E1C1'] },
  { id: 'raspberry-marigold', name: 'Marigold', colours: ['#7B384B', '#D6A53C'] },
  { id: 'pink-sunset', name: 'Sunset', colours: ['#FF9DB1', '#F0563A', '#FAD3A8'] },
];

export const RANDOM_SET = 'random';

export function colourSetById(id: unknown): ColourSet | null {
  return COLOUR_SETS.find((s) => s.id === id) ?? null;
}

/** The chosen set, or one whole set at random when the choice is "random" or unknown. */
export function pickColourSet(choice: unknown, rand: () => number = Math.random): ColourSet {
  return colourSetById(choice) ?? COLOUR_SETS[Math.floor(rand() * COLOUR_SETS.length) % COLOUR_SETS.length]!;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = ch;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function prefersDarkInk(hex: string): boolean { return luminance(hex) < 0.12; }

/**
 * Gives each colour of a set its job: accent (main colour), ink (darkest, when dark enough
 * for outlines) and others (flat fills). Every colour used comes from the set.
 */
export function inkRoles(set: ColourSet): { accent: string; ink: string | null; others: string[] } {
  const byDark = [...set.colours].sort((a, b) => luminance(a) - luminance(b));
  const darkest = byDark[0] ?? set.colours[0] ?? '#000000';
  const ink = prefersDarkInk(darkest) && set.colours.length > 2 ? darkest : null;
  const rest = set.colours.filter((c) => c !== ink);
  // Accent: the strongest mid-tone colour (not the palest).
  const accent = [...rest].sort((a, b) => Math.abs(luminance(a) - 0.25) - Math.abs(luminance(b) - 0.25))[0] ?? darkest;
  return { accent, ink, others: rest.filter((c) => c !== accent) };
}

/** Prompt lines that bind a picture to one whole set. */
export function colourSetRule(set: ColourSet): string {
  const { accent, ink, others } = inkRoles(set);
  return `\nCOLOUR SET (overrides any other colour instruction): use ONLY these colours from one set, ${set.colours.join(', ')}, on white paper. ` +
    `${accent} is the main colour. ${others.length ? `${others.join(' and ')} ${others.length > 1 ? 'are' : 'is'} flat fills for supporting shapes. ` : ''}` +
    `${ink ? `${ink} is the deep ink for outlines and shadows.` : `Outlines and shadows use a deep dark shade of ${accent}, never pure black.`} ` +
    'No colours from outside this set, no gradients.';
}
