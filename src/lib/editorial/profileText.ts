/** Plain-text editing of an editorial profile's lists (one item per line). */
import type { FlagRule, GenreRule } from "./captionAssembler";

const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
const list = (t: string) => t.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

/** "Música: música, concerto" per line. */
export const genresToText = (g: readonly GenreRule[]) => g.map((x) => (x.from.length ? `${x.name}: ${x.from.join(", ")}` : x.name)).join("\n");
export const textToGenres = (t: string): GenreRule[] =>
  lines(t).map((l) => { const [name, rest = ""] = l.split(/:(.*)/s); return { name: name!.trim(), from: rest.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) }; }).filter((g) => g.name);

const RULES: FlagRule[] = ["free", "kids", "english", "festival"];
/** "Grátis / Free = free" per line; a flag without a rule is set by hand only. */
export const flagsToText = (flags: readonly string[], rules: Record<string, string>) => flags.map((f) => (rules[f] ? `${f} = ${rules[f]}` : f)).join("\n");
export function textToFlags(t: string): { flags: string[]; flag_rules: Record<string, FlagRule> } {
  const flags: string[] = []; const flag_rules: Record<string, FlagRule> = {};
  for (const l of lines(t)) {
    const [label, rule] = l.split(/\s=\s/).map((x) => x.trim());
    if (!label) continue;
    flags.push(label);
    if (rule && (RULES as string[]).includes(rule)) flag_rules[label] = rule as FlagRule;
  }
  return { flags, flag_rules };
}

export const textToHashtags = (t: string) => list(t).map((x) => (x.startsWith("#") ? x : `#${x}`).toLowerCase());
export const textToLanguages = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean);
export const textToTemplate = (t: string) => t.split("\n").map((l) => l.trimEnd());
export const textToLines = lines;
