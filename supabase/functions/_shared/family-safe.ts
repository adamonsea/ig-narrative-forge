// Family-safe filter: pure rules, no AI, so every decision is explainable.
//
// Used only when the feed owner switches Family-safe on (topics.family_safe).
// It keeps adult, graphically violent and gambling stories out of the feed
// before they are written. Hard news feeds normally leave it off.
//
// Terms are matched as whole words/phrases (case-insensitive) so place names
// such as "Sussex" or "Essex" never trip the adult list.

export type FamilySafeCategory = 'adult' | 'violence' | 'gambling';

const TERMS: Record<FamilySafeCategory, string[]> = {
  adult: [
    'porn', 'porno', 'pornography', 'pornographic', 'xxx', 'onlyfans', 'nude', 'nudes', 'nudity',
    'naked', 'topless', 'sex tape', 'sex scene', 'sex scenes', 'sex worker', 'sex workers',
    'sexual', 'sexually', 'erotic', 'erotica', 'escort agency', 'strip club', 'stripper',
    'brothel', 'fetish', 'hentai', 'rape', 'raped', 'rapist', 'paedophile', 'pedophile',
    'child abuse', 'grooming gang', 'indecent images',
  ],
  violence: [
    'murder', 'murdered', 'murders', 'murderer', 'manslaughter', 'homicide', 'stabbing',
    'stabbings', 'stabbed', 'shot dead', 'gunman', 'gunmen', 'mass shooting', 'massacre',
    'beheaded', 'beheading', 'decapitated', 'dismembered', 'mutilated', 'gore', 'gory',
    'torture', 'tortured', 'suicide', 'self-harm', 'terror attack', 'bloodbath',
  ],
  gambling: [
    'gambling', 'gamble', 'casino', 'casinos', 'betting', 'bookmaker', 'bookmakers', 'bookies',
    'sportsbook', 'slot machine', 'slot machines', 'online slots', 'poker', 'roulette',
    'blackjack', 'free bets', 'bet365', 'paddy power', 'william hill', 'betfair',
  ],
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PATTERNS: [FamilySafeCategory, string, RegExp][] = (Object.keys(TERMS) as FamilySafeCategory[])
  .flatMap((category) =>
    TERMS[category].map((term) => [
      category,
      term,
      // Whole word/phrase; a hyphen or space inside a phrase matches either.
      new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term).replace(/[- ]/g, '[-\\s]')}(?=$|[^\\p{L}\\p{N}])`, 'iu'),
    ] as [FamilySafeCategory, string, RegExp]),
  );

export interface FamilySafeVerdict {
  safe: boolean;
  category?: FamilySafeCategory;
  term?: string;
}

/** Checks a story's title and text. Returns the first rule it breaks, if any. */
export function familySafeVerdict(title: string | null | undefined, body?: string | null): FamilySafeVerdict {
  const text = `${title ?? ''}\n${(body ?? '').slice(0, 20000)}`;
  for (const [category, term, pattern] of PATTERNS) {
    if (pattern.test(text)) return { safe: false, category, term };
  }
  return { safe: true };
}

/** Plain-English reason stored with a filtered article. */
export function familySafeReason(verdict: FamilySafeVerdict): string {
  const label = verdict.category === 'adult'
    ? 'adult content'
    : verdict.category === 'violence'
      ? 'violent content'
      : 'gambling';
  return `Family-safe: ${label} ("${verdict.term}")`;
}
