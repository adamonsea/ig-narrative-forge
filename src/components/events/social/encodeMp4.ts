/**
 * Fast, Instagram-ready motion export: H.264 + silent AAC in an MP4 (fast start),
 * encoded frame by frame with WebCodecs via mediabunny (loaded only on click).
 * Returns null when the browser can't encode H.264 + AAC, so the caller falls
 * back to real-time MediaRecorder recording.
 */
export async function encodeMp4(
  canvas: HTMLCanvasElement,
  drawFrame: (t: number) => void,
  seconds: number,
  fps: number,
): Promise<Blob | null> {
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") return null;
  try {
    const mb = await import("mediabunny");
    const [videoOk, audioOk] = await Promise.all([
      mb.canEncodeVideo("avc", { width: canvas.width, height: canvas.height, bitrate: 8_000_000 }),
      mb.canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48_000, bitrate: 128_000 }),
    ]);
    if (!videoOk || !audioOk) return null;
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: 8_000_000, keyFrameInterval: 1 });
    const audio = new mb.AudioBufferSource({ codec: "aac", bitrate: 128_000 });
    output.addVideoTrack(video, { frameRate: fps });
    output.addAudioTrack(audio);
    await output.start();
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i++) {
      drawFrame(i / fps);
      await video.add(i / fps, 1 / fps);
    }
    await audio.add(new AudioBuffer({ length: Math.ceil(seconds * 48_000), numberOfChannels: 2, sampleRate: 48_000 }));
    await output.finalize();
    return target.buffer ? new Blob([target.buffer], { type: "video/mp4" }) : null;
  } catch (err) {
    console.warn("MP4 export unavailable, recording instead", err);
    return null;
  }
}
