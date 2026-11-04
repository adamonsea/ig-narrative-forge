import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX, Download, Loader2 } from 'lucide-react';

/* =====================================================================
   Curatr promo — 35s coded "print run" animation (4:5, 1080x1350)
   Three inks only: cream paper, teal ink, black ink.
   ===================================================================== */

// ---- MUSIC SLOT --------------------------------------------------------
// Drop a music file URL here later (e.g. '/promo-music.mp3'). It will loop
// in sync with the timeline, play only when sound is on, and be included
// in the Download MP4 recording. Leave null for effects only.
const MUSIC_TRACK_URL: string | null = null;
const MUSIC_VOLUME = 0.5;
// -----------------------------------------------------------------------

const W = 1080;
const H = 1350;
const DURATION = 35;
const PAPER = '#F2E4C2';
const TEAL = '#2E9C88';
const INK = '#1A1D18';
const RGB = { paper: [242, 228, 194], teal: [46, 156, 136], ink: [26, 29, 24] };

const IMG_BASE = 'https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/visuals/';
const ILLUSTRATIONS = [
  'story-0696a616-4c56-4c32-9661-4de9bbec0aae-1793723807398.webp', // Beachy Head cliffs
  'story-08361577-6237-43e0-bf47-59bee1412855-1793788280669.webp', // Borough football
  'story-b7bbc06d-f45e-4ed8-97d0-703a7fe3b303-1793723863377.webp', // Concert of remembrance
  'story-6f7f0f4d-0a4d-4692-947e-3b1060dd532d-1793729070097.webp', // Curry chef
  'story-e57bf8aa-7f95-428a-9648-162172c7ac08-1793770269554.webp', // Coffee roasters
  'story-3c806923-022b-41be-bacb-b443a3c31d65-1793626317577.webp', // Shingle dredger
].map((f) => IMG_BASE + f);

const LINES: { a: number; b: number; text: string }[] = [
  { a: 0.4, b: 4.8, text: 'Local news is all over the place.' },
  { a: 9.6, b: 14.8, text: 'Pulled together. Credit where it’s due.' },
  { a: 15.2, b: 18.8, text: 'You decide what makes the cut.' },
  { a: 19.4, b: 24.8, text: 'Then off it goes to your readers.' },
  { a: 25.2, b: 29.8, text: 'The newsroom that runs itself.' },
  { a: 30.6, b: 34.7, text: 'From everywhere to everyone.' },
];

// ---------- timing helpers ----------
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const seg = (t: number, a: number, b: number) => easeIO(prog(t, a, b));
/** Off-register offset: drifts before a stamp, snaps to near-zero after. */
const reg = (t: number, at: number) => (t < at ? 9 : 2 * Math.exp(-(t - at) * 6) * Math.cos((t - at) * 30) + 1.5);

// ---------- sound events ----------
type Sfx = 'flutter' | 'clunk' | 'print' | 'thud' | 'crunch' | 'click' | 'bell';
const VIB: Record<Sfx, number | number[]> = {
  flutter: 8,
  clunk: 120,
  print: 30,
  thud: [60, 70, 60],
  crunch: 25,
  click: 10,
  bell: 600,
};
const EVENTS: { t: number; s: Sfx }[] = [
  ...[0, 1, 2, 3].map((i) => ({ t: 1.2 + i * 0.75, s: 'flutter' as Sfx })),
  { t: 8.0, s: 'clunk' },
  ...[0, 1, 2, 3].map((i) => ({ t: 9.8 + i * 1.3, s: 'print' as Sfx })),
  { t: 16.0, s: 'thud' },
  { t: 17.2, s: 'crunch' },
  { t: 20.8, s: 'click' },
  { t: 21.6, s: 'click' },
  { t: 22.6, s: 'click' },
  { t: 24.6, s: 'click' },
  ...[0, 1, 2, 3, 4].map((i) => ({ t: 25.6 + i * 0.95, s: 'print' as Sfx })),
  { t: 32.4, s: 'bell' },
];

// ---------- static textures ----------
function makeGrain() {
  const c = document.createElement('canvas');
  c.width = 540;
  c.height = 675;
  const g = c.getContext('2d')!;
  const d = g.createImageData(c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = Math.random();
    const v = n < 0.5 ? 26 : 242;
    d.data[i] = v;
    d.data[i + 1] = v - 6;
    d.data[i + 2] = v - 20;
    d.data[i + 3] = Math.random() * 34;
  }
  g.putImageData(d, 0, 0);
  // a few fibres
  g.strokeStyle = 'rgba(26,29,24,0.06)';
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 18);
    g.stroke();
  }
  return c;
}

function makeDots(color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.beginPath();
  g.arc(3, 3, 2.1, 0, Math.PI * 2);
  g.arc(9, 9, 2.1, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Turn a full-colour illustration into a two-ink halftone screenprint. */
function screenprint(img: HTMLImageElement) {
  const w = 480;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * r;
  const dh = img.naturalHeight * r;
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  try {
    const d = g.getImageData(0, 0, w, h);
    const p = d.data;
    const cell = 5;
    const k = (Math.PI * 2) / cell;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let L = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
        L = clamp((L - 0.12) * 1.25);
        const u = (x + y) * 0.7071;
        const v = (x - y) * 0.7071;
        const th = (Math.cos(u * k) + Math.cos(v * k) + 2) / 4;
        let col: number[];
        if (L < 0.5) col = L / 0.5 > th ? RGB.teal : RGB.ink;
        else col = (L - 0.5) / 0.5 > th ? RGB.paper : RGB.teal;
        p[i] = col[0];
        p[i + 1] = col[1];
        p[i + 2] = col[2];
        p[i + 3] = 255;
      }
    }
    g.putImageData(d, 0, 0);
  } catch {
    /* tainted canvas: keep the drawn image */
  }
  return c;
}

/** Fallback card art if an illustration can't load. */
function placeholderArt(i: number) {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const g = c.getContext('2d')!;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, 480, 360);
  g.fillStyle = TEAL;
  g.fillRect(0, 230, 480, 130);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(140 + i * 40, 150, 60, 0, Math.PI * 2);
  g.fill();
  return c;
}

type Assets = {
  grain: HTMLCanvasElement;
  dotsTeal: HTMLCanvasElement;
  dotsInk: HTMLCanvasElement;
  arts: HTMLCanvasElement[];
};

// ---------- drawing primitives ----------
type Ctx = CanvasRenderingContext2D;

function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function halftone(g: Ctx, a: Assets, which: 'teal' | 'ink', x: number, y: number, w: number, h: number) {
  const pat = g.createPattern(which === 'teal' ? a.dotsTeal : a.dotsInk, 'repeat');
  if (!pat) return;
  g.fillStyle = pat;
  g.fillRect(x, y, w, h);
}

function newspaper(g: Ctx, a: Assets, o: number) {
  g.fillStyle = TEAL;
  g.fillRect(-120 + o, -82 + o * 0.6, 240, 164);
  g.fillStyle = PAPER;
  g.fillRect(-120, -82, 240, 164);
  halftone(g, a, 'teal', 10, -40, 96, 74);
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.strokeRect(-120, -82, 240, 164);
  g.fillStyle = INK;
  g.fillRect(-104, -66, 208, 16);
  g.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(-104, -30 + i * 16);
    g.lineTo(-10, -30 + i * 16);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, -82);
  g.lineTo(0, 82);
  g.lineWidth = 2;
  g.stroke();
}

function phoneScrap(g: Ctx, _a: Assets, o: number) {
  g.fillStyle = TEAL;
  rr(g, -62 + o, -108 + o, 124, 216, 18);
  g.fill();
  g.fillStyle = INK;
  rr(g, -62, -108, 124, 216, 18);
  g.fill();
  g.fillStyle = TEAL;
  rr(g, -50, -90, 100, 166, 6);
  g.fill();
  g.fillStyle = PAPER;
  g.fillRect(-38, -74, 76, 12);
  g.fillRect(-38, -52, 56, 8);
  g.fillRect(-38, -38, 66, 8);
  g.beginPath();
  g.arc(0, 92, 7, 0, Math.PI * 2);
  g.fill();
}

function notice(g: Ctx, a: Assets, o: number) {
  g.fillStyle = TEAL;
  g.fillRect(-90 + o, -118 + o, 180, 236);
  g.fillStyle = PAPER;
  g.fillRect(-90, -118, 180, 236);
  g.fillStyle = TEAL;
  g.fillRect(-90, -118, 180, 52);
  halftone(g, a, 'ink', -90, 70, 180, 48);
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.strokeRect(-90, -118, 180, 236);
  g.lineWidth = 6;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(-68, -40 + i * 20);
    g.lineTo(i % 2 ? 40 : 68, -40 + i * 20);
    g.stroke();
  }
  g.fillStyle = INK;
  g.beginPath();
  g.arc(0, -128, 11, 0, Math.PI * 2);
  g.fill();
}

function envelopeScrap(g: Ctx, _a: Assets, o: number) {
  g.fillStyle = TEAL;
  g.fillRect(-110 + o, -70 + o, 220, 140);
  g.fillStyle = PAPER;
  g.fillRect(-110, -70, 220, 140);
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.strokeRect(-110, -70, 220, 140);
  g.beginPath();
  g.moveTo(-110, -70);
  g.lineTo(0, 10);
  g.lineTo(110, -70);
  g.stroke();
  g.fillStyle = TEAL;
  g.fillRect(62, -58, 34, 40);
  g.strokeRect(62, -58, 34, 40);
}

const SCRAPS = [newspaper, phoneScrap, notice, envelopeScrap];
const PILE = [
  { x: 470, y: 600, r: -0.22 },
  { x: 640, y: 570, r: 0.3 },
  { x: 560, y: 690, r: 0.12 },
  { x: 440, y: 720, r: -0.4 },
];

/** Credit stamp: teal ring with inner dot, no words. */
function creditStamp(g: Ctx, x: number, y: number, p: number) {
  if (p <= 0) return;
  const s = p < 1 ? 1.8 - 0.8 * easeOut(p) : 1;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.globalAlpha *= clamp(p * 3);
  g.strokeStyle = TEAL;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 20, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = TEAL;
  g.beginPath();
  g.moveTo(0, -10);
  for (let i = 1; i < 10; i++) {
    const r = i % 2 ? 4.5 : 10;
    const an = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(Math.cos(an) * r, Math.sin(an) * r);
  }
  g.closePath();
  g.fill();
  g.restore();
}

const CW = 230;
const CH = 310;
/** A clean story card, drawn centred on 0,0 at width CW. */
function card(g: Ctx, a: Assets, art: HTMLCanvasElement, stampP: number, o = 1.5) {
  g.fillStyle = TEAL;
  g.fillRect(-CW / 2 + o + 4, -CH / 2 + o + 6, CW, CH);
  g.fillStyle = PAPER;
  g.fillRect(-CW / 2, -CH / 2, CW, CH);
  const ix = -CW / 2 + 14;
  const iy = -CH / 2 + 14;
  const iw = CW - 28;
  const ih = iw * 0.75;
  g.drawImage(art, ix, iy, iw, ih);
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.strokeRect(ix, iy, iw, ih);
  g.fillStyle = INK;
  g.fillRect(ix, iy + ih + 18, iw * 0.92, 16);
  g.fillRect(ix, iy + ih + 44, iw * 0.66, 16);
  g.fillStyle = TEAL;
  g.fillRect(ix, iy + ih + 76, iw * 0.4, 9);
  g.lineWidth = 5;
  g.strokeRect(-CW / 2, -CH / 2, CW, CH);
  creditStamp(g, ix + iw - 28, iy + 28, stampP);
}

function tick(g: Ctx, p: number, o: number) {
  if (p <= 0) return;
  const s = p < 1 ? 2.2 - 1.2 * easeOut(p) : 1;
  g.save();
  g.scale(s, s);
  g.globalAlpha *= clamp(p * 4);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const path = () => {
    g.beginPath();
    g.moveTo(-60, 0);
    g.lineTo(-18, 44);
    g.lineTo(70, -58);
  };
  g.strokeStyle = TEAL;
  g.lineWidth = 30;
  g.translate(o, o);
  path();
  g.stroke();
  g.translate(-o, -o);
  g.strokeStyle = INK;
  g.lineWidth = 22;
  path();
  g.stroke();
  g.restore();
}

/** Curatr mark parts in logo units (viewBox 100x168). */
function partTop(g: Ctx) {
  g.beginPath();
  g.moveTo(0, 50);
  g.arc(50, 50, 50, Math.PI, 0);
  g.closePath();
}
function partMid(g: Ctx) {
  g.beginPath();
  g.rect(0, 60, 50, 48);
}
function partBot(g: Ctx) {
  g.beginPath();
  g.moveTo(0, 118);
  g.arc(50, 118, 50, Math.PI, 0, true);
  g.closePath();
}

type PressOpts = {
  cx: number;
  cy: number;
  s: number;
  off?: [number, number][]; // per-part offsets in stage px
  o: number; // register offset
  roll?: number; // roller angle
  machine?: number; // 0 = logo, 1 = press details visible
};
function press(g: Ctx, a: Assets, p: PressOpts) {
  const parts = [partTop, partMid, partBot];
  const off = p.off ?? [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  g.save();
  g.translate(p.cx - 50 * p.s, p.cy - 84 * p.s);
  // teal plate (offset)
  parts.forEach((fn, i) => {
    g.save();
    g.translate(off[i][0] + p.o, off[i][1] + p.o);
    g.scale(p.s, p.s);
    g.fillStyle = TEAL;
    fn(g);
    g.fill();
    g.restore();
  });
  // black plate
  parts.forEach((fn, i) => {
    g.save();
    g.translate(off[i][0], off[i][1]);
    g.scale(p.s, p.s);
    g.fillStyle = INK;
    fn(g);
    g.fill();
    g.restore();
  });
  const m = p.machine ?? 0;
  if (m > 0) {
    g.save();
    g.globalAlpha *= m;
    g.translate(off[0][0], off[0][1]);
    g.scale(p.s, p.s);
    // roller: spokes turning inside the top half-moon
    g.save();
    partTop(g);
    g.clip();
    g.strokeStyle = TEAL;
    g.lineWidth = 3.2;
    for (let i = 0; i < 6; i++) {
      const an = (p.roll ?? 0) + (i * Math.PI) / 3;
      g.beginPath();
      g.moveTo(50, 50);
      g.lineTo(50 + Math.cos(an) * 60, 50 + Math.sin(an) * 60);
      g.stroke();
    }
    g.fillStyle = PAPER;
    g.beginPath();
    g.arc(50, 50, 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.restore();
    // ink tray on the square, halftone on the base
    g.save();
    g.globalAlpha *= m;
    g.translate(off[1][0], off[1][1]);
    g.scale(p.s, p.s);
    g.fillStyle = TEAL;
    g.fillRect(8, 70, 34, 6);
    g.restore();
    g.save();
    g.globalAlpha *= m * 0.9;
    g.translate(off[2][0], off[2][1]);
    g.save();
    g.scale(p.s, p.s);
    partBot(g);
    g.restore();
    g.clip();
    halftone(g, a, 'teal', 0, 118 * p.s, 100 * p.s, 50 * p.s);
    g.restore();
  }
  g.restore();
}

function wrapText(g: Ctx, text: string, max: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > max && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function caption(g: Ctx, t: number) {
  const l = LINES.find((x) => t >= x.a && t <= x.b);
  if (!l) return;
  const alpha = Math.min(prog(t, l.a, l.a + 0.6), 1 - prog(t, l.b - 0.6, l.b));
  g.save();
  g.globalAlpha = easeIO(alpha);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 86;
  g.font = `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  let lines = wrapText(g, l.text.toUpperCase(), 940);
  while (lines.length > 2 && size > 64) {
    size -= 4;
    g.font = `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    lines = wrapText(g, l.text.toUpperCase(), 940);
  }
  const lh = size * 1.0;
  const y0 = 1185 - ((lines.length - 1) * lh) / 2 + (1 - alpha) * 10;
  lines.forEach((s, i) => {
    g.fillStyle = TEAL;
    g.fillText(s, W / 2 + 3, y0 + i * lh + 3);
    g.fillStyle = INK;
    g.fillText(s, W / 2, y0 + i * lh);
  });
  g.restore();
}

// ---------- the scene ----------
const ROW_Y = 760;
const rowX = (i: number) => 540 + (i - 1.5) * (CW + 22);
const PRINT_T = [9.8, 11.1, 12.4, 13.7];
const KEEP = [0, 1, 3]; // card 2 gets crumpled

function render(g: Ctx, a: Assets, t: number) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);

  const arts = a.arts;

  // ===== 0-9: scraps =====
  if (t < 15) {
    for (let i = 0; i < 4; i++) {
      const land = 1.2 + i * 0.75;
      const p = prog(t, land - 1.0, land);
      if (p <= 0) continue;
      let { x, y, r } = PILE[i];
      // fall in
      const fy = lerp(-260, y, easeOut(p));
      const fr = lerp(r + (i % 2 ? 1.2 : -1.2), r, easeOut(p));
      let px = x + Math.sin((1 - p) * 4 + i) * 40 * (1 - p);
      let py = fy;
      let sc = 1;
      // 5.2-6.8: pile slides left & shrinks to make room
      const m = seg(t, 5.2, 6.8);
      px = lerp(px, 150 + (x - 540) * 0.45, m);
      py = lerp(py, 300 + (y - 640) * 0.45, m);
      sc = lerp(1, 0.5, m);
      // 9+: each scrap feeds into the press before its card prints
      const feed = seg(t, PRINT_T[i] - 0.9, PRINT_T[i] - 0.1);
      if (feed >= 1) continue;
      px = lerp(px, 410, feed);
      py = lerp(py, 323, feed);
      sc *= 1 - feed * 0.6;
      g.save();
      g.translate(px, py);
      g.rotate(lerp(fr, 0, feed));
      g.scale(sc, sc);
      g.globalAlpha = 1 - feed * feed;
      SCRAPS[i](g, a, reg(t, land));
      g.restore();
    }
  }

  // ===== 5-19 & 25-35: press =====
  const pressIn = (t >= 5 && t < 19.6) || t >= 25;
  if (pressIn) {
    let cx = 540;
    let cy = 560;
    let s = 2.6;
    let alpha = 1;
    let machine = 0;
    let roll = 0;
    const o = reg(t, 8.0);
    let off: [number, number][] = [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    if (t < 9.4) {
      const pT = seg(t, 5.4, 8.0);
      const pM = seg(t, 5.8, 8.0);
      const pB = seg(t, 6.2, 8.0);
      off = [
        [0, lerp(-700, 0, pT)],
        [lerp(-900, 0, pM), 0],
        [0, lerp(900, 0, pB)],
      ];
      // the lock: tiny squeeze after the clunk
      const k = t > 8 ? Math.exp(-(t - 8) * 8) * Math.sin((t - 8) * 40) * 6 : 0;
      off[0][1] += k;
      off[2][1] -= k;
      machine = seg(t, 8.0, 8.6);
      const mv = seg(t, 8.6, 9.4);
      cx = lerp(540, 540, mv);
      cy = lerp(560, 271, mv);
      s = lerp(2.6, 1.8, mv);
    } else if (t < 19.6) {
      cx = 540;
      cy = 271;
      s = 1.8;
      machine = 1;
      alpha = 1 - seg(t, 18.8, 19.6);
      roll = PRINT_T.reduce((acc, pt) => acc + easeIO(prog(t, pt - 0.5, pt + 0.2)) * Math.PI, 0);
    } else if (t < 30.2) {
      const inP = seg(t, 25, 25.8);
      alpha = inP;
      cx = 330;
      cy = 600;
      s = 2.0;
      machine = 1;
      roll = (t - 25) * 3.2;
    } else {
      const c = seg(t, 30.2, 31.8);
      cx = lerp(330, 540, c);
      cy = lerp(600, 520, c);
      s = lerp(2.0, 2.4, c);
      machine = 1 - c;
      roll = (30.2 - 25) * 3.2 + c * 2;
      alpha = 1 - seg(t, 34.6, 35);
    }
    g.save();
    g.globalAlpha = alpha;
    press(g, a, { cx, cy, s, off, o: t >= 30.2 ? reg(t, 31.8) : o, roll, machine });
    g.restore();

    // wordmark under the final logo
    if (t >= 30.2) {
      const wp = seg(t, 31.6, 32.6);
      if (wp > 0) {
        g.save();
        g.globalAlpha = wp * (1 - seg(t, 34.6, 35));
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.font = '500 96px "Playfair Display", Georgia, serif';
        const y = 520 + 84 * 2.4 + 140 + (1 - wp) * 12;
        const main = 'curatr';
        const mw = g.measureText(main).width;
        g.font = '500 46px "Playfair Display", Georgia, serif';
        const pw = g.measureText('pro').width;
        g.font = '500 96px "Playfair Display", Georgia, serif';
        const dw = g.measureText('.').width;
        const total = mw + dw + pw;
        const x0 = 540 - total / 2;
        g.textAlign = 'left';
        g.fillStyle = INK;
        g.fillText(main, x0, y);
        g.fillStyle = TEAL;
        g.fillText('.', x0 + mw, y);
        g.fillStyle = INK;
        g.font = '500 46px "Playfair Display", Georgia, serif';
        g.fillText('pro', x0 + mw + dw, y);
        g.restore();
      }
    }
  }

  // ===== 9-19: printed cards in a row, tick + crumple =====
  if (t >= 9.3 && t < 21.2) {
    for (let i = 0; i < 4; i++) {
      const pt = PRINT_T[i];
      const e = prog(t, pt, pt + 0.9);
      if (e <= 0) continue;
      // emerge from the press slot, then settle into the row
      const sx = 540 + 90;
      const sy = 323;
      let x = lerp(sx, rowX(i), easeIO(e));
      let y = lerp(sy, ROW_Y, easeIO(e));
      let sc = lerp(0.35, 1, easeOut(e));
      let rot = lerp(0.1, (i - 1.5) * 0.02, easeIO(e));
      let alpha = 1;
      // 19-21: kept cards fly to the phone
      if (t >= 19.2) {
        const k = KEEP.indexOf(i);
        if (k < 0) continue;
        const f = seg(t, 19.4 + k * 0.15, 20.6 + k * 0.15);
        x = lerp(x, 540 + k * 360, f);
        y = lerp(y, 520, f);
        sc = lerp(1, 1.4, f);
        rot = lerp(rot, 0, f);
        if (k > 0) alpha = 1 - seg(t, 20.2 + k * 0.15, 20.7 + k * 0.15);
        if (t > 20.8 + k * 0.15) continue;
      }
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      if (i === 2 && t >= 17.0) {
        // crumple and drop away
        const c = prog(t, 17.0, 17.6);
        const fall = prog(t, 17.5, 18.6);
        g.translate(fall * 60, fall * fall * 900);
        g.rotate(c * 0.6 + fall * 2);
        if (c < 0.5) {
          g.scale(1 - c * 0.6, 1 - c * 0.8);
          card(g, a, arts[i % arts.length], 1);
        } else {
          const r = lerp(110, 70, (c - 0.5) * 2);
          g.fillStyle = TEAL;
          ball(g, r, 6);
          g.fill();
          g.fillStyle = PAPER;
          ball(g, r, 0);
          g.fill();
          g.strokeStyle = INK;
          g.lineWidth = 5;
          g.stroke();
          g.lineWidth = 3;
          for (let j = 0; j < 5; j++) {
            const an = j * 1.3;
            g.beginPath();
            g.moveTo(Math.cos(an) * r * 0.2, Math.sin(an) * r * 0.2);
            g.lineTo(Math.cos(an + 0.5) * r * 0.75, Math.sin(an + 0.5) * r * 0.75);
            g.stroke();
          }
        }
      } else {
        g.rotate(rot);
        g.scale(sc, sc);
        card(g, a, arts[i % arts.length], prog(t, pt + 0.75, pt + 1.05));
        if (i === 0 && t < 19.4) {
          g.translate(0, -30);
          tick(g, prog(t, 15.85, 16.1), reg(t, 16.0));
        }
      }
      g.restore();
    }
  }

  // ===== 19.6-25: phone carousel, then envelope =====
  if (t >= 19.4 && t < 25.6) {
    const ph = seg(t, 19.4, 20.2) * (1 - seg(t, 23.4, 24.0));
    const pw = 400;
    const phH = 740;
    const px = 540;
    const py = 540;
    const pscale = lerp(0.85, 1, ph) * lerp(1, 0.6, seg(t, 23.4, 24.0));
    if (ph > 0) {
      g.save();
      g.translate(px, py);
      g.scale(pscale, pscale);
      g.globalAlpha = ph;
      g.fillStyle = TEAL;
      rr(g, -pw / 2 + 8, -phH / 2 + 10, pw, phH, 46);
      g.fill();
      g.fillStyle = INK;
      rr(g, -pw / 2, -phH / 2, pw, phH, 46);
      g.fill();
      g.fillStyle = PAPER;
      rr(g, -pw / 2 + 18, -phH / 2 + 50, pw - 36, phH - 110, 14);
      g.fill();
      g.fillStyle = PAPER;
      g.beginPath();
      g.arc(0, phH / 2 - 30, 12, 0, Math.PI * 2);
      g.fill();
      // swipe dots
      const idx = seg(t, 21.3, 21.8) + seg(t, 22.3, 22.8);
      for (let d = 0; d < 3; d++) {
        g.fillStyle = Math.round(idx) === d ? TEAL : INK;
        g.beginPath();
        g.arc(-24 + d * 24, phH / 2 - 96, 7, 0, Math.PI * 2);
        g.fill();
      }
      // carousel content (after the cards have arrived)
      if (t >= 20.7) {
        g.save();
        rr(g, -pw / 2 + 18, -phH / 2 + 50, pw - 36, phH - 110, 14);
        g.clip();
        for (let k = 0; k < 3; k++) {
          const cxk = (k - idx) * 360;
          g.save();
          g.translate(cxk, -20);
          g.scale(1.4, 1.4);
          card(g, a, arts[KEEP[k] % arts.length], 1);
          g.restore();
        }
        g.restore();
      }
      g.restore();
    }

    // envelope
    const ev = seg(t, 23.6, 24.1) * (1 - seg(t, 25.0, 25.6));
    if (ev > 0) {
      g.save();
      g.translate(540, 600);
      g.globalAlpha = ev;
      const ew = 560;
      const eh = 360;
      const o = reg(t, 24.6);
      // back
      g.fillStyle = TEAL;
      g.fillRect(-ew / 2 + o, -eh / 2 + o, ew, eh);
      g.fillStyle = PAPER;
      g.fillRect(-ew / 2, -eh / 2, ew, eh);
      // a card slipping in
      const slip = seg(t, 23.8, 24.4);
      if (slip < 1) {
        g.save();
        g.beginPath();
        g.rect(-ew / 2, -eh / 2 - 400, ew, 400 + eh * 0.5);
        g.clip();
        g.translate(0, lerp(-300, 40, slip));
        card(g, a, arts[0], 1);
        g.restore();
      }
      halftone(g, a, 'teal', -ew / 2, eh / 2 - 70, ew, 70);
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.strokeRect(-ew / 2, -eh / 2, ew, eh);
      g.beginPath();
      g.moveTo(-ew / 2, eh / 2);
      g.lineTo(-40, 10);
      g.moveTo(ew / 2, eh / 2);
      g.lineTo(40, 10);
      g.stroke();
      // flap closes
      const flap = seg(t, 24.2, 24.6);
      g.save();
      g.translate(0, -eh / 2);
      g.scale(1, lerp(-1, 1, flap));
      g.beginPath();
      g.moveTo(-ew / 2, 0);
      g.lineTo(0, eh * 0.55);
      g.lineTo(ew / 2, 0);
      g.closePath();
      g.fillStyle = PAPER;
      g.fill();
      g.stroke();
      g.restore();
      // seal
      if (flap >= 1) {
        g.fillStyle = TEAL;
        g.beginPath();
        g.arc(0, -eh / 2 + eh * 0.55, 22 * clamp((t - 24.6) * 6), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  // ===== 25-30.5: clock + self-printing press =====
  if (t >= 25 && t < 31) {
    const cin = seg(t, 25.2, 26) * (1 - seg(t, 30.0, 30.8));
    if (cin > 0) {
      const ccx = 790;
      const ccy = 330;
      const R = 120;
      const day = prog(t, 25.6, 29.8);
      g.save();
      g.globalAlpha = cin;
      // sun then moon arcing over the clock
      const an = Math.PI + day * Math.PI;
      const sx = ccx + Math.cos(an) * 190;
      const sy = ccy + Math.sin(an) * 175;
      if (day < 0.5) {
        g.fillStyle = TEAL;
        g.beginPath();
        g.arc(sx, sy, 30, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = TEAL;
        g.lineWidth = 5;
        for (let i = 0; i < 8; i++) {
          const ra = (i * Math.PI) / 4 + t;
          g.beginPath();
          g.moveTo(sx + Math.cos(ra) * 40, sy + Math.sin(ra) * 40);
          g.lineTo(sx + Math.cos(ra) * 52, sy + Math.sin(ra) * 52);
          g.stroke();
        }
      } else {
        g.fillStyle = INK;
        g.beginPath();
        g.arc(sx, sy, 28, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = PAPER;
        g.beginPath();
        g.arc(sx + 12, sy - 8, 24, 0, Math.PI * 2);
        g.fill();
      }
      // face
      g.fillStyle = TEAL;
      g.beginPath();
      g.arc(ccx + 6, ccy + 6, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PAPER;
      g.beginPath();
      g.arc(ccx, ccy, R, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.beginPath();
      g.arc(ccx, ccy, R, 0, Math.PI * 2);
      g.clip();
      halftone(g, a, 'teal', ccx - R, ccy + R * 0.35, R * 2, R);
      g.restore();
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.beginPath();
      g.arc(ccx, ccy, R, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 6;
      for (let i = 0; i < 12; i++) {
        const ta = (i * Math.PI) / 6;
        g.beginPath();
        g.moveTo(ccx + Math.cos(ta) * (R - 18), ccy + Math.sin(ta) * (R - 18));
        g.lineTo(ccx + Math.cos(ta) * (R - 6), ccy + Math.sin(ta) * (R - 6));
        g.stroke();
      }
      const hand = -Math.PI / 2 + easeIO(day) * Math.PI * 4;
      g.lineCap = 'round';
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(ccx, ccy);
      g.lineTo(ccx + Math.cos(hand) * (R - 30), ccy + Math.sin(hand) * (R - 30));
      g.stroke();
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(ccx, ccy);
      g.lineTo(ccx + Math.cos(hand / 12 - Math.PI / 3) * (R - 60), ccy + Math.sin(hand / 12 - Math.PI / 3) * (R - 60));
      g.stroke();
      g.fillStyle = TEAL;
      g.beginPath();
      g.arc(ccx, ccy, 10, 0, Math.PI * 2);
      g.fill();
      g.restore();

      // fresh cards printing onto a growing stack
      for (let i = 0; i < 5; i++) {
        const pt = 25.6 + i * 0.95;
        const e = prog(t, pt - 0.6, pt);
        if (e <= 0) continue;
        const sx2 = 430;
        const sy2 = 600 + 113 * 2 - 84 * 2;
        const tx = 770 + (i % 2 ? 8 : -6);
        const ty = 820 - i * 8;
        g.save();
        g.globalAlpha = cin;
        g.translate(lerp(sx2, tx, easeIO(e)), lerp(sy2, ty, easeIO(e)));
        g.rotate(lerp(0.2, (i % 2 ? 0.05 : -0.04), easeIO(e)));
        const s = lerp(0.3, 0.95, easeOut(e));
        g.scale(s, s);
        card(g, a, arts[(i + 4) % arts.length], prog(t, pt, pt + 0.3));
        g.restore();
      }
    }
  }

  caption(g, t);

  // paper grain over everything
  g.save();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'multiply';
  g.drawImage(a.grain, 0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.35;
  g.drawImage(a.grain, 0, 0, W, H);
  g.restore();
}

function ball(g: Ctx, r: number, o: number) {
  g.beginPath();
  for (let i = 0; i < 14; i++) {
    const an = (i / 14) * Math.PI * 2;
    const rr2 = r * (i % 2 ? 0.82 : 1) * (1 + Math.sin(i * 2.3) * 0.08);
    const x = Math.cos(an) * rr2 + o;
    const y = Math.sin(an) * rr2 + o;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

// ---------- Web Audio sound design ----------
class Sound {
  ctx: AudioContext;
  master: GainNode;
  rec: MediaStreamAudioDestinationNode;
  noise: AudioBuffer;
  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.rec = this.ctx.createMediaStreamDestination();
    this.master.connect(this.ctx.destination);
    this.master.connect(this.rec);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  env(peak: number, at: number, attack: number, decay: number) {
    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(peak, at + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    gn.connect(this.master);
    return gn;
  }
  noiseHit(at: number, dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, attack = 0.005) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    src.connect(f).connect(this.env(peak, at, attack, dur));
    src.start(at, Math.random() * 0.5, dur + attack + 0.05);
  }
  tone(at: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine', attack = 0.004) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    o.connect(this.env(peak, at, attack, dur));
    o.start(at);
    o.stop(at + attack + dur + 0.05);
  }
  play(s: Sfx) {
    const n = this.ctx.currentTime + 0.01;
    switch (s) {
      case 'flutter':
        for (let i = 0; i < 4; i++) this.noiseHit(n + i * 0.045, 0.08, 'bandpass', 2600 - i * 300, 1400, 0.18);
        break;
      case 'clunk':
        this.tone(n, 110, 38, 0.45, 0.9);
        this.tone(n, 220, 90, 0.12, 0.3, 'triangle');
        this.noiseHit(n, 0.18, 'lowpass', 1800, 200, 0.6);
        this.noiseHit(n + 0.06, 0.05, 'highpass', 3000, 3000, 0.15);
        break;
      case 'print':
        this.noiseHit(n, 0.32, 'bandpass', 500, 3200, 0.22, 0.12);
        this.tone(n + 0.42, 150, 55, 0.14, 0.7);
        this.noiseHit(n + 0.42, 0.06, 'lowpass', 900, 300, 0.3);
        break;
      case 'thud':
        this.tone(n, 95, 40, 0.3, 1.0);
        this.noiseHit(n, 0.12, 'lowpass', 1200, 150, 0.7);
        break;
      case 'crunch':
        for (let i = 0; i < 9; i++) this.noiseHit(n + i * 0.035 + Math.random() * 0.02, 0.04, 'highpass', 1500 + Math.random() * 2500, 1200, 0.25);
        break;
      case 'click':
        this.tone(n, 2400, 1800, 0.03, 0.18, 'square');
        this.noiseHit(n, 0.02, 'highpass', 4000, 4000, 0.1);
        break;
      case 'bell':
        [880, 1760 * 1.19, 880 * 2.76, 880 * 5.4].forEach((f, i) =>
          this.tone(n, f, f * 0.998, 2.4 - i * 0.4, [0.35, 0.14, 0.1, 0.05][i], 'sine', 0.003),
        );
        break;
    }
  }
}

function vibrate(p: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(p);
  } catch {
    /* unsupported: skip silently */
  }
}

const fmt = (s: number) => `${Math.floor(s)}`.padStart(2, '0');

// ---------- page ----------
export default function Promo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const assetsRef = useRef<Assets | null>(null);
  const tRef = useRef(0);
  const playingRef = useRef(true);
  const soundRef = useRef<Sound | null>(null);
  const soundOnRef = useRef(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const recordingRef = useRef(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState<null | number>(null);

  useEffect(() => {
    document.title = 'Curatr — the print run';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&family=Playfair+Display:wght@500&display=swap';
    document.head.appendChild(link);
    let cancelled = false;
    (async () => {
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement | null>((res) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => res(im);
          im.onerror = () => res(null);
          im.src = src;
        });
      const [imgs] = await Promise.all([
        Promise.all(ILLUSTRATIONS.map(loadImg)),
        Promise.race([
          Promise.all([
            document.fonts.load('800 86px "Barlow Condensed"'),
            document.fonts.load('500 96px "Playfair Display"'),
          ]),
          new Promise((r) => setTimeout(r, 2500)),
        ]),
      ]);
      if (cancelled) return;
      assetsRef.current = {
        grain: makeGrain(),
        dotsTeal: makeDots(TEAL),
        dotsInk: makeDots(INK),
        arts: imgs.map((im, i) => (im ? screenprint(im) : placeholderArt(i))),
      };
      tRef.current = 0;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      link.remove();
    };
  }, []);

  // main loop
  useEffect(() => {
    if (!ready) return;
    const g = canvasRef.current!.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const prev = tRef.current;
      if (playingRef.current) {
        let next = prev + dt;
        if (next >= DURATION) {
          if (recordingRef.current) next = DURATION;
          else {
            next = next % DURATION;
            if (musicRef.current) musicRef.current.currentTime = 0;
          }
        }
        // fire events crossed this frame
        if (soundOnRef.current && soundRef.current && next > prev) {
          for (const e of EVENTS) {
            if (e.t > prev && e.t <= next) {
              soundRef.current.play(e.s);
              if (!recordingRef.current) vibrate(VIB[e.s]);
            }
          }
        }
        tRef.current = next;
      }
      render(g, assetsRef.current!, tRef.current);
      if (now - lastUi > 100) {
        lastUi = now;
        setTime(tRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  const ensureSound = useCallback(() => {
    if (!soundRef.current) soundRef.current = new Sound();
    void soundRef.current.ctx.resume();
    if (MUSIC_TRACK_URL && !musicRef.current) {
      const m = new Audio(MUSIC_TRACK_URL);
      m.crossOrigin = 'anonymous';
      m.loop = true;
      const src = soundRef.current.ctx.createMediaElementSource(m);
      const gn = soundRef.current.ctx.createGain();
      gn.gain.value = MUSIC_VOLUME;
      src.connect(gn).connect(soundRef.current.master);
      musicRef.current = m;
    }
    return soundRef.current;
  }, []);

  const syncMusic = useCallback((play: boolean) => {
    const m = musicRef.current;
    if (!m) return;
    if (play && soundOnRef.current) {
      m.currentTime = tRef.current % (m.duration || DURATION);
      void m.play().catch(() => {});
    } else m.pause();
  }, []);

  const togglePlay = () => {
    const p = !playingRef.current;
    playingRef.current = p;
    setPlaying(p);
    syncMusic(p);
  };

  const toggleSound = () => {
    const on = !soundOnRef.current;
    if (on) ensureSound();
    soundOnRef.current = on;
    setSoundOn(on);
    if (on) {
      tRef.current = 0;
      playingRef.current = true;
      setPlaying(true);
    }
    syncMusic(on && playingRef.current);
  };

  const scrub = (v: number) => {
    tRef.current = v;
    setTime(v);
    if (musicRef.current) musicRef.current.currentTime = v % (musicRef.current.duration || DURATION);
  };

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas || recording !== null) return;
    const stream = canvas.captureStream(30);
    if (soundOnRef.current && soundRef.current) {
      soundRef.current.rec.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
    const mime = types.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    recordingRef.current = true;
    tRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
    syncMusic(true);
    rec.start(250);
    setRecording(0);
    await new Promise<void>((r) => {
      const iv = setInterval(() => {
        setRecording(tRef.current / DURATION);
        if (tRef.current >= DURATION) {
          clearInterval(iv);
          r();
        }
      }, 200);
    });
    await new Promise((r) => setTimeout(r, 300));
    rec.stop();
    await done;
    recordingRef.current = false;
    tRef.current = 0;
    setRecording(null);
    const isMp4 = mime.startsWith('video/mp4');
    const blob = new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curatr-print-run.${isMp4 ? 'mp4' : 'webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 p-4" style={{ background: '#E6D6B2' }}>
      <h1 className="sr-only">Curatr promo: from everywhere to everyone</h1>
      <div
        className="relative w-full shadow-2xl"
        style={{ maxWidth: 'min(100%, calc((100dvh - 150px) * 0.8))', aspectRatio: '4 / 5', background: PAPER }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block h-full w-full"
          role="img"
          aria-label="Animated promo: scattered local news is printed into story cards, approved, sent to readers, and becomes the Curatr logo."
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ color: INK }}>
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
      </div>

      <div
        className="flex w-full flex-wrap items-center gap-3 rounded-xl px-3 py-2"
        style={{ maxWidth: 'min(100%, calc((100dvh - 150px) * 0.8))', background: PAPER, color: INK }}
      >
        <button
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: INK, color: PAPER }}
          disabled={recording !== null}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <span className="w-10 text-sm tabular-nums">0:{fmt(time)}</span>
        <input
          type="range"
          min={0}
          max={DURATION}
          step={0.05}
          value={time}
          onChange={(e) => scrub(Number(e.target.value))}
          aria-label="Timeline"
          className="min-w-[120px] flex-1"
          style={{ accentColor: TEAL }}
          disabled={recording !== null}
        />
        <span className="w-10 text-sm tabular-nums">0:{DURATION}</span>
        <button
          onClick={toggleSound}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: soundOn ? TEAL : 'transparent', color: soundOn ? PAPER : INK, border: `2px solid ${soundOn ? TEAL : INK}` }}
          disabled={recording !== null}
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {soundOn ? 'Sound on' : 'Play with sound'}
        </button>
        <button
          onClick={download}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: INK, color: PAPER }}
          disabled={!ready || recording !== null}
        >
          {recording !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {recording !== null ? `Recording ${Math.round(recording * 100)}%` : 'Download MP4'}
        </button>
      </div>
    </main>
  );
}
