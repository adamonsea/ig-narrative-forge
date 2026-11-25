/** Lower-case; for Gmail drop dots and +tags so one inbox = one identity. */
export function normaliseEmail(email: string): string {
  const [rawLocal = '', rawDomain = ''] = email.trim().toLowerCase().split('@');
  let local = rawLocal.split('+')[0] ?? '';
  const domain = rawDomain === 'googlemail.com' ? 'gmail.com' : rawDomain;
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export async function hashEmail(normalised: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
