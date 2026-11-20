import { isFramedPublisherCover } from "./pictureFrame";
/**
 * Publisher-photo credits on story covers.
 * A cover is a publisher photo when it is not stored in our own storage
 * (AI pictures and owner uploads always are), or our framed copy of one (Edit picture).
 * Publisher photos are always credited:
 * the credit the source site gives, otherwise the publisher's name.
 */

const OWN_HOSTS = [
  (() => {
    try {
      return new URL(import.meta.env['VITE_SUPABASE_URL'] || "").hostname;
    } catch {
      return "";
    }
  })(),
  "curatr.pro",
].filter(Boolean);

export function isPublisherPhoto(url: string | null | undefined, ownHosts: string[] = OWN_HOSTS): boolean {
  if (isFramedPublisherCover(url)) return true;
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !ownHosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** "Photo: {credit}" for a publisher photo, else null. */
export function photoCreditLabel(
  url: string | null | undefined,
  credit: string | null | undefined,
  publisher: string | null | undefined,
  ownHosts?: string[] | undefined,
): string | null {
  if (!isPublisherPhoto(url, ownHosts)) return null;
  const name = (credit || "").trim() || (publisher || "").trim();
  return name ? `Photo: ${name}` : null;
}
