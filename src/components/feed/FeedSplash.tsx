/**
 * Quiet loading screen for public feeds. Sent as plain HTML + inline CSS inside the
 * page so it shows before any feed code runs; appears only after 1s, and the feed
 * removes it (200ms fade) once card 1 is up via hideFeedSplash(). Uses only the
 * first-screen data already in the page.
 */
import type { FeedFirstScreen } from "@/lib/feedFirstScreen";
import { londonToday } from "@/lib/whatsOn";
import { feedSurfaceStyles } from "@/lib/feedSurfaces";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const safeColour = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(c.trim()) ? c.trim() : null);

export function storiesToday(fs: FeedFirstScreen): number {
  const today = londonToday();
  const ids = new Set<string>();
  for (const r of fs.rows ?? []) {
    const d = r.story_published_at ?? r.story_created_at;
    if (d && londonToday(new Date(d)) === today) ids.add(r.story_id ?? r.id);
  }
  return ids.size;
}

export function feedSplashHtml(fs: FeedFirstScreen | null | undefined): string {
  if (!fs) return "";
  const bc = fs.fullTopic?.branding_config ?? {};
  const brand = safeColour(bc.primary_color) ?? safeColour(fs.fullTopic?.illustration_primary_color) ?? "#0E1A2B";
  const bg = safeColour(bc.feed_background_color) ?? "#FAF8F4";
  // Muted text picked against the feed's own background, as the feed does.
  const custom = safeColour(bc.feed_background_color);
  const muted = custom ? `rgb(${feedSurfaceStyles({ background: custom, brand }).backgroundTones.muted.join(",")})` : "#4F5866";
  const name = String(fs.publicTopic?.name ?? "");
  const logo = typeof bc.logo_url === "string" && /^https:\/\//.test(bc.logo_url) ? bc.logo_url : null;
  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const n = storiesToday(fs);
  const mark = logo
    ? `<img src="${esc(logo)}" alt="${esc(name)}" style="height:68px;max-height:96px;max-width:min(90vw,384px);object-fit:contain">`
    : `<div style="font-family:Lexend,system-ui,sans-serif;font-weight:600;text-transform:uppercase;font-size:32px;line-height:1.15;letter-spacing:.02em;color:${brand}">${esc(name)}</div>`;
  return `<style>#feed-splash{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:${bg};text-align:center;padding:24px;opacity:0;animation:fsIn .2s ease-out 1s forwards;transition:opacity .2s ease-out}#feed-splash.fs-out{opacity:0!important;animation:none}#feed-splash .fs-t{width:120px;height:2px;background:#E4E0D8;overflow:hidden;position:relative}#feed-splash .fs-b{position:absolute;top:0;left:0;height:100%;width:40%;background:${brand};animation:fsSweep 1.6s ease-in-out infinite}#feed-splash p{margin:0;font-family:Lexend,system-ui,sans-serif;font-weight:300;font-size:17px;line-height:1.5;color:${muted}}@keyframes fsIn{to{opacity:1}}@keyframes fsSweep{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}@media (prefers-reduced-motion:reduce){#feed-splash .fs-b{animation:none;left:30%}}</style><div id="feed-splash" role="status" aria-label="Loading ${esc(name)}">${mark}<div class="fs-t"><div class="fs-b"></div></div><div><p>${esc(date)}</p>${n > 0 ? `<p>${n} ${n === 1 ? "story" : "stories"} today</p>` : ""}</div></div>`;
}

/** Once the splash has started to appear, it stays fully shown at least this long. */
export const SPLASH_MIN_SHOWN_MS = 1200;
const SPLASH_DELAY_MS = 1000;
const SPLASH_FADE_IN_MS = 200;

/**
 * Hide the splash. Before it has appeared (first 1s) it is removed silently, so fast loads
 * never see it. Once it has started to appear it stays for SPLASH_MIN_SHOWN_MS, then fades
 * over 200ms, so it never flickers in and out. Safe to call more than once.
 */
export function hideFeedSplash() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("feed-splash");
  if (!el || el.dataset["hiding"]) return;
  el.dataset["hiding"] = "1";
  if (Number(getComputedStyle(el).opacity) === 0) {
    el.parentElement?.remove();
    return;
  }
  const visibleAt = SPLASH_DELAY_MS + SPLASH_FADE_IN_MS;
  const wait = Math.max(0, visibleAt + SPLASH_MIN_SHOWN_MS - performance.now());
  setTimeout(() => {
    el.style.opacity = getComputedStyle(el).opacity;
    void el.offsetWidth;
    el.classList.add("fs-out");
    setTimeout(() => el.parentElement?.remove(), 220);
  }, wait);
}

export function FeedSplash({ firstScreen }: { firstScreen: FeedFirstScreen | null | undefined }) {
  const html = feedSplashHtml(firstScreen);
  if (!html) return null;
  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
