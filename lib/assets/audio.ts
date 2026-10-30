// Soundtrack for the promo video (F9): an audio file the user uploads (Rankeo does not generate music),
// trimmed to the length of the video with a fade-out. Pure maths and choices; audio-encode.ts runs them
// in the browser with Web Audio and WebCodecs.

/** AAC and Opus encoders in browsers work at 48 kHz; decodeAudioData resamples to it. */
export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_BITRATE = 128_000;
/** Seconds of fade-out when the track is cut to the video length. */
export const FADE_OUT_SECONDS = 1.5;
/** Frames per AudioData handed to the encoder. */
export const AUDIO_CHUNK_FRAMES = 4096;

export const AUDIO_ACCEPT = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac";

export function isAudioFile(f: { name: string; type: string }): boolean {
  return f.type ? f.type.startsWith("audio/") : /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(f.name);
}

export type AudioPlan = {
  /** Seconds of audio that go in the video. */
  seconds: number;
  /** The same, in sample frames. */
  frames: number;
  /** When the fade-out starts (equals `seconds` when there is none). */
  fadeStart: number;
  /** The track is longer than the video and gets cut. */
  trimmed: boolean;
};

/** How much of the track goes in, and where the fade starts. A track shorter than the video plays once, then silence. */
export function audioPlan(sourceSeconds: number, videoSeconds: number, sampleRate = AUDIO_SAMPLE_RATE, fade = FADE_OUT_SECONDS): AudioPlan {
  const seconds = Math.max(0, Math.min(sourceSeconds, videoSeconds));
  const trimmed = sourceSeconds > videoSeconds + 0.01;
  const fadeLength = trimmed ? Math.min(fade, seconds / 2) : 0;
  return { seconds, frames: Math.round(seconds * sampleRate), fadeStart: seconds - fadeLength, trimmed };
}

/** Volume (0–1) at `t` seconds: full until the fade, then a straight line down to silence at the end. */
export function gainAt(t: number, plan: AudioPlan): number {
  if (t >= plan.seconds) return 0;
  if (t <= plan.fadeStart || plan.seconds === plan.fadeStart) return 1;
  return (plan.seconds - t) / (plan.seconds - plan.fadeStart);
}

/** The first `plan.frames` samples of one channel with the fade applied. */
export function applyFade(samples: Float32Array, plan: AudioPlan, sampleRate = AUDIO_SAMPLE_RATE): Float32Array {
  const out = new Float32Array(plan.frames);
  const fadeFrom = Math.floor(plan.fadeStart * sampleRate);
  for (let i = 0; i < plan.frames; i++) {
    const v = samples[i] ?? 0;
    out[i] = i < fadeFrom ? v : v * gainAt(i / sampleRate, plan);
  }
  return out;
}

/** Splits `frames` in consecutive pieces of at most `size`. */
export function chunkRanges(frames: number, size = AUDIO_CHUNK_FRAMES): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  for (let start = 0; start < frames; start += size) out.push({ start, length: Math.min(size, frames - start) });
  return out;
}

export type AudioCodec = "aac" | "opus";

/** WebCodecs codec strings: AAC-LC, which App Store Connect requires, and Opus. */
export const AUDIO_ENCODER_CODEC: Record<AudioCodec, string> = { aac: "mp4a.40.2", opus: "opus" };

/** AAC when the browser can encode it (what the stores want in an MP4); Opus otherwise; null when neither. */
export function chooseAudioCodec(support: { aac: boolean; opus: boolean }): AudioCodec | null {
  if (support.aac) return "aac";
  if (support.opus) return "opus";
  return null;
}

const secs = (n: number) => `${(Math.round(n * 10) / 10).toString().replace(".", ",")} s`;

/** One Spanish line on what happens to the track. */
export function audioSummary(sourceSeconds: number, videoSeconds: number): string {
  const plan = audioPlan(sourceSeconds, videoSeconds);
  if (plan.trimmed) return `Dura ${secs(sourceSeconds)}: se corta a ${secs(videoSeconds)} con un fundido de salida de ${secs(plan.seconds - plan.fadeStart)}.`;
  if (sourceSeconds < videoSeconds - 0.01) return `Dura ${secs(sourceSeconds)} y el vídeo ${secs(videoSeconds)}: suena una vez y el final queda en silencio.`;
  return `Dura lo mismo que el vídeo (${secs(videoSeconds)}).`;
}
