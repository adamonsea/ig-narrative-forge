/**
 * Tiny WebAudio cue synthesiser + haptics for the explainer film.
 * No audio files to host; everything is generated on the fly.
 */

type CueName = 'rustle' | 'tick' | 'confirm' | 'pulse' | 'thud' | 'chime' | 'land' | 'whoosh';

let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

const tone = (
  ac: AudioContext,
  { freq, dur, type = 'sine', gain = 0.06, slideTo }: { freq: number; dur: number; type?: OscillatorType; gain?: number; slideTo?: number },
) => {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const now = ac.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
};

const noise = (ac: AudioContext, { dur, gain = 0.03, cutoff = 1800 }: { dur: number; gain?: number; cutoff?: number }) => {
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start();
};

export const playCue = (name: CueName, muted: boolean) => {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    switch (name) {
      case 'rustle':
        noise(ac, { dur: 0.55, gain: 0.025, cutoff: 2600 });
        break;
      case 'tick':
        tone(ac, { freq: 1500, dur: 0.03, type: 'square', gain: 0.015 });
        break;
      case 'confirm':
        tone(ac, { freq: 660, dur: 0.16, gain: 0.05 });
        tone(ac, { freq: 990, dur: 0.22, gain: 0.035 });
        break;
      case 'pulse':
        tone(ac, { freq: 320, dur: 0.14, type: 'triangle', gain: 0.035 });
        break;
      case 'thud':
        tone(ac, { freq: 150, dur: 0.18, type: 'sine', gain: 0.07, slideTo: 70 });
        break;
      case 'chime':
        tone(ac, { freq: 880, dur: 0.5, gain: 0.045 });
        tone(ac, { freq: 1320, dur: 0.6, gain: 0.022 });
        break;
      case 'land':
        tone(ac, { freq: 520, dur: 0.09, type: 'triangle', gain: 0.035 });
        break;
      case 'whoosh':
        noise(ac, { dur: 0.3, gain: 0.03, cutoff: 900 });
        break;
    }
  } catch {
    /* audio is decorative — never break playback */
  }
};

/** Short, polite haptic taps. Skipped when unsupported or under reduced motion. */
export const haptic = (ms: number, allowed: boolean) => {
  if (!allowed) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(Math.min(Math.max(ms, 5), 20));
  } catch {
    /* ignore */
  }
};

export type { CueName };