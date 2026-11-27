import { z } from 'zod';
/** URLs are checked again by the existing source/import services before fetching. */
export function usableRemoteUrl(raw: string) {
  try {
    const u=new URL(raw);
    const h=u.hostname.toLowerCase();
    return ['https:','http:'].includes(u.protocol) && !u.username && !u.password
      && !u.port && h.includes('.') && !/^(localhost|metadata)(\.|$)/.test(h)
      && !/\.(local|internal|localhost)$/.test(h)
      && !/^[\d.]+$/.test(h) && !h.includes(':') && !h.startsWith('[');
  } catch { return false; }
}
export const remoteUrl=z.string().url().max(2048).refine(usableRemoteUrl,'Use a public website address.');
export const colour=z.string().regex(/^#[0-9a-f]{6}$/i,'Use a six-digit colour.');
export const ownerStory=z.object({link:remoteUrl.optional(),text:z.string().trim().min(50).max(100000).optional()})
  .refine(v=>Boolean(v.link)!==Boolean(v.text),'Supply a link or text, not both.');
export const pinHours=z.union([z.literal(24),z.literal(48),z.literal(168)]).default(24);
