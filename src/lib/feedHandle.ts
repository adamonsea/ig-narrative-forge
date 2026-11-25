/**
 * Feed handles: curatr.pro/@{slug} is the public address of /feed/{slug}/...
 * The router rewrites between the two (src/router.tsx); route files stay under /feed/$slug.
 */
export const HANDLE_PATTERN = /^[a-z0-9-]{3,30}$/;

const AT = /^\/@([^/]+)(\/.*)?$/;
const FEED = /^\/feed\/([^/]+)(\/.*)?$/;

/** Public "/@x/rest" -> internal "/feed/x/rest"; anything else unchanged (null). */
export function handleToInternal(pathname: string): string | null {
  const m = AT.exec(pathname);
  if (!m || !m[1]) return null;
  return `/feed/${m[1]}${m[2] ?? ""}`;
}

/** Internal "/feed/x/rest" -> public "/@x/rest"; legacy /feed/topic/... is left alone (null). */
export function internalToHandle(pathname: string): string | null {
  const m = FEED.exec(pathname);
  if (!m || !m[1] || m[1] === "topic") return null;
  return `/@${m[1]}${m[2] ?? ""}`;
}

/** Path of a feed page in @ form, e.g. feedPath("lisbon", "/story/1") -> "/@lisbon/story/1". */
export const feedPath = (slug: string, path = "") => `/@${slug}${path}`;

const LEGACY = /^\/feed\/(?:topic\/)?([^/]+)(\/.*)?$/;

/** Server: "/feed/x/rest?q" or "/feed/topic/x/rest?q" -> "/@x/rest?q" (relative), else null. */
export function permanentFeedRedirect(href: string): string | null {
  const url = new URL(href);
  const m = LEGACY.exec(url.pathname);
  if (!m || !m[1] || m[1] === "topic") return null;
  return `/@${m[1]}${m[2] ?? ""}${url.search}`;
}
