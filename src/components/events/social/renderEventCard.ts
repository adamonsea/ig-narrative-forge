/**
 * Event social poster, drawn in the browser on a 9:16 canvas (1080×1920).
 * Only three things: the listing photo full-bleed (category illustration in the
 * feed's colour when there's no photo), a calendar-page date tile and the event
 * name. Everything else goes in the post caption (eventCaption.ts).
 * Still = the last frame; motion = a 5-second push-in with the tile settling
 * and the name rising, encoded to MP4 + silent AAC (encodeMp4.ts), else recorded with MediaRecorder. Layout in posterLayout.ts
 * keeps everything clear of Instagram's own buttons and captions.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCategoryIllustration } from "@/components/events/EventCategoryIllustration";
import { eventIllustrationTint, feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { eventPhotoUrl } from "@/lib/eventPhotos";
import { dateBlock } from "@/lib/whatsOn";
import type { SocialEvent } from "./eventCaption";
import { encodeMp4 } from "./encodeMp4";
import { H, LINE_HEIGHT, TILE, TITLE_MAX_LINES, W, posterLayout, titleSize } from "./posterLayout";

export { H, W } from "./posterLayout";
const FPS = 30;
export const MOTION_SECONDS = 5;
const HOLD_SECONDS = 1;
const INK = "rgb(11 22 38)";
const PAPER = "rgb(255 255 255)";
const FONT = "Lexend, sans-serif";

export interface RenderOpts { brandColor?: string | null | undefined; feedName: string; feedUrl: string; currency?: string | null | undefined }

export interface PreparedPoster { bg: HTMLImageElement | null; photo: boolean }

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Fonts and the background picture, loaded once per event. */
export async function preparePoster(e: SocialEvent, opts: RenderOpts): Promise<PreparedPoster> {
  await Promise.all(["500", "700"].map((w) => document.fonts?.load(`${w} 48px Lexend`).catch(() => null)));
  const photoUrl = eventPhotoUrl(e.image_path);
  if (photoUrl) {
    const img = await loadImage(photoUrl);
    if (img) return { bg: img, photo: true };
  }
  const svg = renderToStaticMarkup(createElement(EventCategoryIllustration, {
    category: e.event_type, color: toCss(eventIllustrationTint(opts.brandColor)), angled: false,
  })).replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round(H * 0.62)}"`);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  return { bg: img, photo: false };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const step = (t: number, start: number, dur = 0.6) => ease((t - start) / dur);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[\s,;:.]+$/, "")}…`;
    return kept;
  }
  return lines;
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, zoom: number) {
  const iw = img.naturalWidth || w;
  const ih = img.naturalHeight || h;
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Draw one frame at time t (seconds); t >= MOTION_SECONDS gives the finished still. */
export function drawPosterFrame(ctx: CanvasRenderingContext2D, e: SocialEvent, opts: RenderOpts, prep: PreparedPoster, t: number) {
  const pal = feedBrandPalette(opts.brandColor).light;
  const zoom = 1 + 0.08 * ease(t / MOTION_SECONDS);

  // Background: photo full-bleed, or the category art on the feed's tint
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  if (prep.photo && prep.bg) {
    cover(ctx, prep.bg, 0, 0, W, H, zoom);
  } else {
    ctx.fillStyle = toCss(eventIllustrationTint(opts.brandColor));
    ctx.fillRect(0, 0, W, H);
    if (prep.bg) cover(ctx, prep.bg, 0, 0, W, H, zoom);
  }
  ctx.restore();

  // Dark wash from the middle down so white type always reads
  const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
  g.addColorStop(0, "rgba(6, 12, 22, 0)");
  g.addColorStop(0.45, "rgba(6, 12, 22, 0.55)");
  g.addColorStop(1, "rgba(6, 12, 22, 0.88)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Title layout first, so the tile can sit above it
  const size = titleSize(e.title);
  ctx.font = `700 ${size}px ${FONT}`;
  const probe = posterLayout(1, size);
  const lines = wrap(ctx, e.title, probe.textWidth, TITLE_MAX_LINES);
  const L = posterLayout(lines.length, size);

  // Calendar page: settles in with a slight turn
  const b = dateBlock(e.start_date);
  const k = step(t, 0.3, 0.8);
  ctx.save();
  ctx.globalAlpha = k;
  const cx = L.tileX + TILE.w / 2, cy = L.tileY + TILE.h / 2;
  ctx.translate(cx, cy - (1 - k) * 70);
  ctx.rotate(((1 - k) * -6 * Math.PI) / 180);
  ctx.translate(-TILE.w / 2, -TILE.h / 2);
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.beginPath(); ctx.roundRect(0, 0, TILE.w, TILE.h, TILE.radius);
  ctx.fillStyle = PAPER; ctx.fill();
  ctx.shadowColor = "transparent";
  // Header band in the feed's colour, month on it
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0, 0, TILE.w, TILE.h, TILE.radius); ctx.clip();
  ctx.fillStyle = toCss(pal.fill);
  ctx.fillRect(0, 0, TILE.w, TILE.header);
  ctx.restore();
  // Binding rings
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  for (const rx of [TILE.w * 0.28, TILE.w * 0.72]) { ctx.beginPath(); ctx.roundRect(rx - 9, -16, 18, 40, 9); ctx.fill(); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = toCss(pal.onFill);
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(b.month.toUpperCase(), TILE.w / 2, TILE.header / 2 + 4);
  ctx.fillStyle = INK;
  ctx.font = `700 132px ${FONT}`;
  ctx.fillText(b.day, TILE.w / 2, TILE.header + 92);
  ctx.fillStyle = "rgba(11, 22, 38, 0.62)";
  ctx.font = `500 40px ${FONT}`;
  ctx.fillText(b.weekday.toUpperCase(), TILE.w / 2, TILE.h - 40);
  ctx.restore();

  // Event name: lines rise in one after another
  ctx.save();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = PAPER;
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 24;
  lines.forEach((line, i) => {
    const s = step(t, 1 + i * 0.14, 0.7);
    ctx.globalAlpha = s;
    ctx.fillText(line, L.tileX, L.baselines[i]! + (1 - s) * size * LINE_HEIGHT * 0.4);
  });
  ctx.restore();
}

function newCanvas() {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  return c;
}

/** The finished poster as a PNG. */
export async function renderEventStill(e: SocialEvent, opts: RenderOpts): Promise<Blob> {
  const prep = await preparePoster(e, opts);
  const canvas = newCanvas();
  drawPosterFrame(canvas.getContext("2d")!, e, opts, prep, MOTION_SECONDS);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the image"))), "image/png"));
}

/** Plays the motion once on a canvas (Desk preview). Returns a stop function. */
export function playPoster(canvas: HTMLCanvasElement, e: SocialEvent, opts: RenderOpts, prep: PreparedPoster, onDone?: () => void): () => void {
  const ctx = canvas.getContext("2d")!;
  const start = performance.now();
  let raf = 0;
  const tick = () => {
    const t = (performance.now() - start) / 1000;
    drawPosterFrame(ctx, e, opts, prep, Math.min(t, MOTION_SECONDS));
    if (t < MOTION_SECONDS) raf = requestAnimationFrame(tick); else onDone?.();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

function pickMimeType(): string {
  for (const c of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

/** The motion version: 5 seconds of movement plus a short hold (Instagram-ready MP4 with silent audio where the browser can encode it; otherwise recorded live as MP4 or WebM). */
export async function renderEventMotion(e: SocialEvent, opts: RenderOpts): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const prep = await preparePoster(e, opts);
  const canvas = newCanvas();
  const ctx = canvas.getContext("2d")!;
  const mp4 = await encodeMp4(canvas, (t) => drawPosterFrame(ctx, e, opts, prep, Math.min(t, MOTION_SECONDS)), MOTION_SECONDS + HOLD_SECONDS, FPS);
  if (mp4) return { blob: mp4, ext: "mp4" };
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  drawPosterFrame(ctx, e, opts, prep, 0);
  recorder.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      drawPosterFrame(ctx, e, opts, prep, Math.min(t, MOTION_SECONDS));
      if (t < MOTION_SECONDS + HOLD_SECONDS) requestAnimationFrame(tick); else resolve();
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
