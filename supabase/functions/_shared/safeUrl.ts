// Blocks server-side fetches to private, loopback, link-local and metadata addresses.
const BLOCKED_HOSTS = /^(localhost|metadata\.google\.internal|metadata)$|\.(internal|local|localhost)$/i;

export function isPrivateIp(ip: string): boolean {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (a.includes(':')) {
    if (a === '::1' || a === '::') return true;
    if (/^f[cd]/.test(a) || /^fe[89ab]/.test(a)) return true;
    const m = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const p = a.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [x, y] = p;
  return x === 0 || x === 10 || x === 127 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31)
    || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || x >= 224;
}

/** True only for http(s) URLs on default ports whose host resolves solely to public addresses. */
export async function isPublicHttpUrl(raw: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.test(host)) return false;
  if (/^[\d.]+$/.test(host) || host.includes(':')) return !isPrivateIp(host);
  const ips: string[] = [];
  for (const t of ['A', 'AAAA'] as const) {
    try { ips.push(...(await Deno.resolveDns(host, t))); } catch { /* none */ }
  }
  return ips.length > 0 && ips.every((ip) => !isPrivateIp(ip));
}

/** Fetch HTML following up to 3 redirects by hand, re-checking each hop. */
export async function fetchPublicHtml(raw: string): Promise<string> {
  let current = raw;
  for (let hop = 0; hop <= 3; hop++) {
    if (!(await isPublicHttpUrl(current))) throw new Error('that address is not allowed');
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CuratrBot/1.0)', Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      await res.body?.cancel();
      if (!loc) throw new Error('redirect without location');
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  throw new Error('too many redirects');
}
