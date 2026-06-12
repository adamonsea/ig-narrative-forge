// In-browser Story Reel renderer + recorder.
// Draws the 3-beat teaser onto a 9:16 canvas and records it to a downloadable
// video file using MediaRecorder. This is the browser-first render path
// (server-side high-res render comes later).
import { ReelTeaserContent, REEL_PACE, REEL_TOTAL_SECONDS } from './storyReelContent';

const W = 1080;
const H = 1920;
const FPS = 30;

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerY: number,
  lineHeight: number
) {
  const totalH = lines.length * lineHeight;
  let y = centerY - totalH / 2 + lineHeight / 2;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }
}

// Smooth fade in/out envelope for a beat.
function envelope(t: number, start: number, duration: number): number {
  const local = t - start;
  if (local < 0 || local > duration) return 0;
  const fade = Math.min(0.6, duration * 0.2);
  if (local < fade) return local / fade;
  if (local > duration - fade) return (duration - local) / fade;
  return 1;
}

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return 'video/webm';
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function recordReel(content: ReelTeaserContent): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const bg = content.backgroundImage
    ? await loadImage(content.backgroundImage)
    : null;

  const mimeType = pickMimeType();
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const tHeadlineEnd = REEL_PACE.headline;
  const tDetailEnd = REEL_PACE.headline + REEL_PACE.detail;

  const drawFrame = (t: number) => {
    // Background
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, W, H);
    if (bg) {
      const scale = Math.max(W / bg.width, H / bg.height);
      const dw = bg.width * scale;
      const dh = bg.height * scale;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }
    // Dark gradient overlay for legibility
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Brand bar (always on)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 38px system-ui, sans-serif';
    ctx.fillText(content.brandName.toUpperCase(), 60, 120);
    ctx.globalAlpha = 1;

    if (content.sourceLabel) {
      ctx.textAlign = 'right';
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#dddddd';
      ctx.font = '400 34px system-ui, sans-serif';
      ctx.fillText(content.sourceLabel, W - 60, 120);
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'center';

    // Beat 1: Headline
    const aHead = envelope(t, 0, tHeadlineEnd);
    if (aHead > 0) {
      ctx.globalAlpha = aHead;
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 78px Georgia, serif';
      const lines = wrapText(ctx, content.headline, W - 160);
      drawLines(ctx, lines, H / 2, 96);
      ctx.globalAlpha = 1;
    }

    // Beat 2: Detail
    const aDetail = envelope(t, tHeadlineEnd, REEL_PACE.detail);
    if (aDetail > 0 && content.detail) {
      ctx.globalAlpha = aDetail;
      ctx.fillStyle = '#f2f2f2';
      ctx.font = '500 56px system-ui, sans-serif';
      const lines = wrapText(ctx, content.detail, W - 180);
      drawLines(ctx, lines, H / 2, 78);
      ctx.globalAlpha = 1;
    }

    // Beat 3: CTA
    const aCta = envelope(t, tDetailEnd, REEL_PACE.cta);
    if (aCta > 0) {
      ctx.globalAlpha = aCta;
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 52px system-ui, sans-serif';
      ctx.fillText('Read the full story', W / 2, H / 2 - 60);
      ctx.fillStyle = '#7c5cff';
      ctx.font = '700 58px system-ui, sans-serif';
      const urlLines = wrapText(ctx, content.feedUrl, W - 160);
      drawLines(ctx, urlLines, H / 2 + 60, 70);
      ctx.globalAlpha = 1;
    }

    // Source attribution footer
    if (content.sourceLabel) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#dddddd';
      ctx.font = '400 34px system-ui, sans-serif';
      ctx.fillText(`Source: ${content.sourceLabel}`, W / 2, H - 110);
      ctx.globalAlpha = 1;
    }
  };

  return new Promise<void>((resolve, reject) => {
    const start = performance.now();
    recorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        a.download = `reel-${content.brandName.toLowerCase().replace(/\s+/g, '-')}-${stamp}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    recorder.onerror = (e) => reject((e as ErrorEvent).error ?? new Error('Recording failed'));

    recorder.start();

    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      drawFrame(Math.min(elapsed, REEL_TOTAL_SECONDS));
      if (elapsed >= REEL_TOTAL_SECONDS) {
        recorder.stop();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}