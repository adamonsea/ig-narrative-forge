/**
 * Event social assets, drawn in the browser on a 9:16 canvas (1080×1920):
 * a still image (the last frame) and a 6-second motion version recorded with
 * MediaRecorder. Same parts as the feed's individual event card: the stored
 * listing photo or the category illustration, the date block across the seam,
 * title, venue, facts and the tidy description, then the feed's name and link.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCategoryIllustration } from "@/components/events/EventCategoryIllustration";
import { EVENT_CATEGORY_LABELS, isEventCategory } from "@/components/events/EventCategoryIcon";
import { eventIllustrationTint, feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { eventPhotoUrl } from "@/lib/eventPhotos";
import { completeDescription } from "@/lib/eventDescription";
import { dateBlock, priceLine } from "@/lib/whatsOn";
import { socialWhen, type SocialEvent } from "./eventCaption";

export const W = 1080;
export const H = 1920;
const FPS = 30;
export const MOTION_SECONDS = 6;
const BAND_H = 760;
const M = 88;
const INK = "rgb(11 22 38)";
const PAPER = "rgb(255 255 255)";

export interface RenderOpts { brandColor?: string | null; feedName: string; feedUrl: string; currency?: string | null }

interface Prepared { band: HTMLImageElement | null; photo: boolean }

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function prepare(e: SocialEvent, opts: RenderOpts): Promise<Prepared> {
  await Promise.all(["400", "600", "700"].map((w) => document.fonts?.load(`${w} 48px Lexend`).catch(() => null)));
  const photoUrl = eventPhotoUrl(e.image_path);
  if (photoUrl) {
    const img = await loadImage(photoUrl);
    if (img) return { band: img, photo: true };
  }
  const svg = renderToStaticMarkup(createElement(EventCategoryIllustration, {
    category: e.event_type, color: toCss(eventIllustrationTint(opts.brandColor)), angled: false,
  })).replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAND_H}"`);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  return { band: img, photo: false };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
/** 0→1 between start and start+dur seconds. */
const step = (t: number, start: number, dur = 0.6) => ease((t - start) / dur);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s,;:.]+$/, "")}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw one frame at time t (seconds); t >= MOTION_SECONDS gives the finished still. */
function drawFrame(ctx: CanvasRenderingContext2D, e: SocialEvent, opts: RenderOpts, prep: Prepared, t: number) {
  const pal = feedBrandPalette(opts.brandColor).light;
  const fill = toCss(pal.fill);
  const onFill = toCss(pal.onFill);
  const accent = toCss(pal.text);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Band: photo or illustration, slow push-in, angled bottom edge
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, BAND_H * 0.82); ctx.lineTo(0, BAND_H); ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = step(t, 0, 0.8);
  if (prep.band) {
    const zoom = 1.08 - 0.08 * ease(t / MOTION_SECONDS);
    const iw = prep.band.naturalWidth || W;
    const ih = prep.band.naturalHeight || BAND_H;
    const cover = Math.max(W / iw, BAND_H / ih) * zoom;
    const dw = iw * cover, dh = ih * cover;
    ctx.drawImage(prep.band, (W - dw) / 2, (BAND_H - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = toCss(eventIllustrationTint(opts.brandColor));
    ctx.fillRect(0, 0, W, BAND_H);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // Category pill
  const cat = isEventCategory(e.event_type) ? EVENT_CATEGORY_LABELS[e.event_type] : EVENT_CATEGORY_LABELS.other;
  ctx.globalAlpha = step(t, 0.4);
  ctx.font = "600 34px Lexend, sans-serif";
  const pw = ctx.measureText(cat).width + 56;
  roundRect(ctx, M, 72, pw, 72, 36);
  ctx.fillStyle = PAPER; ctx.fill();
  ctx.fillStyle = INK; ctx.textBaseline = "middle";
  ctx.fillText(cat, M + 28, 108);

  // Date block across the seam, slides up
  const b = dateBlock(e.start_date);
  const blockW = 260, blockH = 300;
  const by = BAND_H - blockH / 2 - 40 + (1 - step(t, 0.6, 0.7)) * 80;
  ctx.globalAlpha = step(t, 0.6, 0.5);
  roundRect(ctx, M - 10, by - 10, blockW + 20, blockH + 20, 44);
  ctx.fillStyle = PAPER; ctx.fill();
  roundRect(ctx, M, by, blockW, blockH, 36);
  ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = onFill; ctx.textAlign = "center";
  ctx.font = "600 44px Lexend, sans-serif"; ctx.fillText(b.weekday, M + blockW / 2, by + 62);
  ctx.font = "700 132px Lexend, sans-serif"; ctx.fillText(b.day, M + blockW / 2, by + 158);
  ctx.font = "600 44px Lexend, sans-serif"; ctx.fillText(b.month, M + blockW / 2, by + 252);
  ctx.textAlign = "left";

  // Title
  let y = by + blockH + 110;
  const rise = (s: number) => (1 - step(t, s)) * 40;
  ctx.globalAlpha = step(t, 1.2);
  ctx.fillStyle = INK; ctx.textBaseline = "alphabetic";
  const titleSize = e.title.length > 60 ? 64 : e.title.length > 32 ? 78 : 92;
  ctx.font = `600 ${titleSize}px Lexend, sans-serif`;
  for (const line of wrap(ctx, e.title, W - M * 2, 3)) { ctx.fillText(line, M, y + rise(1.2)); y += titleSize * 1.12; }

  // Facts: when · where · price
  y += 30;
  ctx.globalAlpha = step(t, 2);
  ctx.font = "600 44px Lexend, sans-serif";
  ctx.fillStyle = accent;
  const facts = [socialWhen(e), e.location, priceLine(e.price, e.is_free, opts.currency)].filter(Boolean) as string[];
  for (const f of facts) for (const line of wrap(ctx, f, W - M * 2, 2)) { ctx.fillText(line, M, y + rise(2)); y += 58; }

  // Description: whole sentences only
  const blurb = completeDescription(e.description, 200);
  if (blurb) {
    y += 26;
    ctx.globalAlpha = step(t, 2.8) * 0.8;
    ctx.fillStyle = INK;
    ctx.font = "400 40px Lexend, sans-serif";
    const room = Math.max(1, Math.floor((H - 260 - y) / 54));
    for (const line of wrap(ctx, blurb, W - M * 2, Math.min(5, room))) { ctx.fillText(line, M, y + rise(2.8)); y += 54; }
  }

  // Footer: the feed and its link
  ctx.globalAlpha = step(t, 3.8);
  roundRect(ctx, M, H - 200, W - M * 2, 112, 56);
  ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = onFill; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.font = "600 38px Lexend, sans-serif";
  ctx.fillText(`${opts.feedName} · ${opts.feedUrl}`, W / 2, H - 144, W - M * 2 - 60);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;
}

function newCanvas() {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  return c;
}

/** The finished card as a PNG. */
export async function renderEventStill(e: SocialEvent, opts: RenderOpts): Promise<Blob> {
  const prep = await prepare(e, opts);
  const canvas = newCanvas();
  drawFrame(canvas.getContext("2d")!, e, opts, prep, MOTION_SECONDS);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the image"))), "image/png"));
}

function pickMimeType(): string {
  for (const c of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

/** The 6-second motion version (MP4 where the browser can, otherwise WebM). */
export async function renderEventMotion(e: SocialEvent, opts: RenderOpts): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const prep = await prepare(e, opts);
  const canvas = newCanvas();
  const ctx = canvas.getContext("2d")!;
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  drawFrame(ctx, e, opts, prep, 0);
  recorder.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      drawFrame(ctx, e, opts, prep, t);
      if (t < MOTION_SECONDS + 1.5) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  return { blob: new Blob(chunks, { type: mimeType }), ext: mimeType.startsWith("video/mp4") ? "mp4" : "webm" };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const assetFileName = (title: string) =>
  title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "event";
