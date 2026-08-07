#!/usr/bin/env python3
"""Offline high-resolution renderer for the Curatr explainer film.

Plays the chrome-free /explainer-export stage in headless Chromium, captures
every composited frame via CDP screencast (PNG, lossless), resamples to a
constant frame rate, then composites the presenter clips back in as a circular
bubble carrying the narration audio.

Usage:
    python3 scripts/render_explainer.py [--fps 30] [--res 1080|1440|2160] [--out PATH]

--res 1080 => 1920x1080, 1440 => 2560x1440, 2160 => 3840x2160 (4K).
--scale is still accepted as the raw device-scale-factor equivalent.
Needs the dev server on :8080 (or --origin), ffmpeg, and Playwright.
"""
import argparse, asyncio, base64, re, shutil, subprocess, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

BASE_W, BASE_H = 1920, 1080
END_HOLD_MS = 3000

p = argparse.ArgumentParser()
p.add_argument("--fps", type=int, default=30)
p.add_argument("--res", type=int, choices=[1080, 1440, 2160], default=None)
p.add_argument("--scale", type=float, default=None)
p.add_argument("--origin", default="http://localhost:8080")
p.add_argument("--cdn", default="https://curatr.pro")
p.add_argument("--out", default=None)
p.add_argument("--stage", default="/explainer-export")
args = p.parse_args()

RES_SCALE = {1080: 1.0, 1440: 4 / 3, 2160: 2.0}
if args.scale is None:
    res = args.res or 1080
    args.scale = RES_SCALE[res]
else:
    res = round(BASE_H * args.scale)

W, H = round(BASE_W * args.scale), round(BASE_H * args.scale)
STAGE_URL = f"{args.origin}{args.stage}?res={res}&chrome=0"
OUT = Path(args.out or f"/mnt/documents/curatr-explainer-{H}p.mp4")
WORK = Path(tempfile.mkdtemp(prefix="explainer-render-"))
FRAMES = WORK / "frames"; FRAMES.mkdir()

def log(*m): print("[render]", *m, flush=True)
def ff(a): subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *a], check=True)


async def capture():
    """Real-time screencast capture. Scenes run infinite looping animations,
    so Chromium virtual time starves and stalls; playing at normal speed and
    keeping each frame's timestamp gives clean, correctly paced output."""
    captured = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=[
            "--force-color-profile=srgb", "--font-render-hinting=none",
            "--disable-frame-rate-limit", "--hide-scrollbars",
        ])
        ctx = await browser.new_context(viewport={"width": BASE_W, "height": BASE_H},
                                        device_scale_factor=args.scale)
        page = await ctx.new_page()
        await page.goto(f"{args.origin}{args.stage}", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__explainerTiming", timeout=30000)
        timing = await page.evaluate("window.__explainerTiming")
        total_ms = timing["totalMs"] + END_HOLD_MS
        log(f"stage ready - {W}x{H}, capturing {total_ms/1000:.1f}s in real time")

        cdp = await ctx.new_cdp_session(page)
        idx = 0

        async def ack(sid):
            try:
                await cdp.send("Page.screencastFrameAck", {"sessionId": sid})
            except Exception:
                pass

        def on_frame(ev):
            nonlocal idx
            dest = FRAMES / f"f{idx:06d}.png"
            dest.write_bytes(base64.b64decode(ev["data"]))
            captured.append((ev["metadata"]["timestamp"], dest))
            idx += 1
            asyncio.create_task(ack(ev["sessionId"]))

        cdp.on("Page.screencastFrame", on_frame)
        # Restart the film so capture begins on beat one.
        await page.reload(wait_until="networkidle")
        await cdp.send("Page.startScreencast",
                       {"format": "png", "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})
        await asyncio.sleep(total_ms / 1000)
        await cdp.send("Page.stopScreencast")
        await asyncio.sleep(0.5)
        await browser.close()

    log(f"captured {len(captured)} frames (~{len(captured)/(total_ms/1000):.1f}fps)")
    lines = []
    for i, (ts, dest) in enumerate(captured):
        nxt = captured[i + 1][0] if i + 1 < len(captured) else ts + 1 / args.fps
        lines.append(f"file '{dest}'")
        lines.append(f"duration {max(nxt - ts, 1/240):.4f}")
    lines.append(f"file '{captured[-1][1]}'")
    (WORK / "stage.txt").write_text("\n".join(lines))
    return timing


def fetch_clips(scenes):
    src = Path("src/components/explainer/avatar.ts").read_text()
    urls = dict(re.findall(r"(\w+):\s*'(/__l5e/[^']+)'", src))
    out = []
    for s in scenes:
        rel = urls.get(s["id"])
        if not rel:
            out.append(None); continue
        dest = WORK / f"{s['id']}.mp4"
        subprocess.run(["curl", "-sfL", f"{args.cdn}{rel}", "-o", str(dest)], check=True)
        out.append(dest)
    return out


def presenter_track(scenes, clips):
    """Pad or trim each clip to its beat length so the bubble stays in step."""
    beats = []
    for i, (scene, clip) in enumerate(zip(scenes, clips)):
        secs = f"{scene['durationMs']/1000:.3f}"
        dest = WORK / f"beat-{i}.mp4"
        if clip:
            ff(["-i", str(clip), "-vf", f"tpad=stop_mode=clone:stop_duration=30,fps={args.fps}",
                "-af", "apad", "-t", secs, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-ar", "48000", "-ac", "2", str(dest)])
        else:
            ff(["-f", "lavfi", "-i", f"color=c=black:s=512x512:r={args.fps}",
                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", secs,
                "-c:v", "libx264", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", str(dest)])
        beats.append(dest)
    lst = WORK / "beats.txt"
    lst.write_text("\n".join(f"file '{b}'" for b in beats))
    track = WORK / "presenter.mp4"
    ff(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(track)])
    return track


def compose(track):
    stage = WORK / "stage.mp4"
    ff(["-f", "concat", "-safe", "0", "-i", str(WORK / "stage.txt"),
        "-fps_mode", "cfr", "-r", str(args.fps),
        "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", str(stage)])
    S = round(220 * args.scale)   # matches the on-site bubble at 1080p
    M = round(48 * args.scale)
    R = S / 2
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ff(["-i", str(stage), "-i", str(track), "-filter_complex",
        f"[1:v]scale={S}:{S}:force_original_aspect_ratio=increase,crop={S}:{S},format=rgba,"
        f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
        f"a='if(gt(pow(X-{R},2)+pow(Y-{R},2),pow({R},2)),0,255)'[bub];"
        f"[0:v][bub]overlay=W-w-{M}:H-h-{M}:shortest=0[v]",
        "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "16", "-preset", "medium",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(OUT)])


timing = asyncio.run(capture())
log("frames captured - fetching presenter clips")
clips = fetch_clips(timing["scenes"])
log("building presenter track")
track = presenter_track(timing["scenes"], clips)
log("composing final video")
compose(track)
shutil.rmtree(WORK, ignore_errors=True)
log(f"done -> {OUT}")
