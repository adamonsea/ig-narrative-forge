/**
 * Browser tab and home-screen icons. index.html declares several Curatr icons (svg, two
 * pngs, ico, apple-touch); browsers pick among all of them, so a feed page must replace
 * the whole set, not just the first one, or the tab can keep showing Curatr.
 */
interface IconLink {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
}

const CURATR_ICONS: IconLink[] = [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
  { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
  { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
  { rel: "shortcut icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
  { rel: "apple-touch-icon", href: "/curatr-icon.png", sizes: "512x512" },
];

function setIcons(icons: IconLink[]) {
  if (typeof document === "undefined") return;
  document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((el) => el.remove());
  for (const icon of icons) {
    const link = document.createElement("link");
    link.rel = icon.rel;
    link.href = icon.href;
    if (icon.type) link.type = icon.type;
    if (icon.sizes) link.setAttribute("sizes", icon.sizes);
    document.head.appendChild(link);
  }
}

/** A feed's own icon in the tab and on the home screen, replacing every Curatr icon. */
export function setFeedIcons(faviconUrl: string, touchIconUrl?: string | null) {
  setIcons([
    { rel: "icon", href: faviconUrl },
    { rel: "apple-touch-icon", href: touchIconUrl || faviconUrl },
  ]);
}

/** Back to Curatr's own icons (workspace and marketing pages). */
export function restoreCuratrIcons() {
  setIcons(CURATR_ICONS);
}
