// Picks the colour for the next illustration based on the feed's colour mode.
// Modes (stored in topics.branding_config):
//  - single (default): always illustration_primary_color
//  - cycle: rotates through illustration_color_palette in order
//  - random: any vivid colour, chosen fresh each time
export type IllustrationColorMode = 'single' | 'cycle' | 'random';

const HEX = /^#[0-9a-fA-F]{6}$/;

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

export function randomIllustrationColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 55 + Math.floor(Math.random() * 30);
  const l = 42 + Math.floor(Math.random() * 14);
  return hslToHex(h, s, l);
}

// deno-lint-ignore no-explicit-any
export async function pickIllustrationColor(supabase: any, topicId: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase.from('topics').select('branding_config').eq('id', topicId).single();
    const cfg = (data?.branding_config ?? {}) as Record<string, unknown>;
    const mode = cfg.illustration_color_mode as IllustrationColorMode | undefined;
    if (mode === 'random') return randomIllustrationColor();
    if (mode === 'cycle') {
      const palette = (Array.isArray(cfg.illustration_color_palette) ? cfg.illustration_color_palette : [])
        .filter((c): c is string => typeof c === 'string' && HEX.test(c));
      if (palette.length === 0) return fallback;
      const cursor = Number(cfg.illustration_color_cursor) || 0;
      const color = palette[cursor % palette.length];
      await supabase.from('topics')
        .update({ branding_config: { ...cfg, illustration_color_cursor: (cursor + 1) % palette.length } })
        .eq('id', topicId);
      return color;
    }
  } catch (e) {
    console.warn('pickIllustrationColor failed, using primary colour', e);
  }
  return fallback;
}
