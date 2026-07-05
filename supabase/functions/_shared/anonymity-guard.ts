// Editorial anonymity guard.
//
// UK law (Sexual Offences (Amendment) Act 1992) grants lifelong anonymity to
// victims of rape and other sexual offences. Because we cannot know the identity
// of anyone depicted, AI-generated illustrations must NEVER be attached to these
// stories in automated modes — an invented "person" image could be read as the
// victim. These stories are held for manual editorial judgement instead.

const ANONYMITY_PATTERNS: RegExp[] = [
  /\braped?\b/i,
  /\brapist\b/i,
  /\brapes\b/i,
  /\braping\b/i,
  /\bgang[-\s]?rape\b/i,
  /\bsexual(?:ly)?\s+assault/i,
  /\bsexual\s+offen[cs]e/i,
  /\bsexual\s+abuse\b/i,
  /\bindecent\s+assault\b/i,
  /\bsexual\s+violence\b/i,
  /\bchild\s+sex(?:ual)?\s+(?:abuse|offen[cs]e|exploitation)\b/i,
  /\bgrooming\b/i,
  /\bmolest(?:ed|ation|ing)?\b/i,
];

export interface AnonymityCheck {
  requiresAnonymity: boolean;
  matched: string | null;
}

/**
 * Returns true when the supplied text references a sexual offence that carries
 * victim anonymity, meaning the story must not receive an auto-generated image.
 */
export function checkAnonymity(...parts: (string | null | undefined)[]): AnonymityCheck {
  const text = parts.filter(Boolean).join(' \n ');
  for (const pattern of ANONYMITY_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      return { requiresAnonymity: true, matched: m[0].toLowerCase() };
    }
  }
  return { requiresAnonymity: false, matched: null };
}
