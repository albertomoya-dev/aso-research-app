import {
  applyFade,
  AUDIO_BITRATE,
  AUDIO_ENCODER_CODEC,
  AUDIO_SAMPLE_RATE,
  type AudioCodec,
  type AudioPlan,
  audioPlan,
  chooseAudioCodec,
  chunkRanges,
} from "./audio";

// Browser only: decodes the uploaded track with Web Audio and encodes it with WebCodecs (AudioEncoder),
// or plays it into a MediaStream for the real-time WebM fallback.

/** Decodes an audio file (mp3, m4a, wav, ogg…) to 48 kHz PCM. Throws a Spanish message when the browser cannot. */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  // decodeAudioData resamples to the context rate, which is what the encoders want.
  const ctx = new OfflineAudioContext(2, 1, AUDIO_SAMPLE_RATE);
  try {
    return await ctx.decodeAudioData(data);
  } catch {
    throw new Error("Tu navegador no puede leer este archivo de audio. Prueba con MP3, M4A (AAC) o WAV.");
  }
}

export const channelsOf = (buffer: AudioBuffer) => Math.min(2, buffer.numberOfChannels);

function encoderConfig(codec: AudioCodec, numberOfChannels: number): AudioEncoderConfig {
  return { codec: AUDIO_ENCODER_CODEC[codec], sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels, bitrate: AUDIO_BITRATE };
}

/** The codec this browser can encode for an MP4 audio track, or null (no AudioEncoder, or neither AAC nor Opus). */
export async function pickMp4AudioCodec(numberOfChannels: number): Promise<AudioCodec | null> {
  if (typeof AudioEncoder === "undefined") return null;
  const supported = async (codec: AudioCodec) => {
    try {
      return Boolean((await AudioEncoder.isConfigSupported(encoderConfig(codec, numberOfChannels))).supported);
    } catch {
      return false;
    }
  };
  return chooseAudioCodec({ aac: await supported("aac"), opus: await supported("opus") });
}

/**
 * Encodes the first `videoSeconds` of the track (with the fade-out) and hands every chunk to `onChunk`,
 * in order. Returns the plan used.
 */
export async function encodeAudioTrack(
  buffer: AudioBuffer,
  videoSeconds: number,
  codec: AudioCodec,
  onChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void,
): Promise<AudioPlan> {
  const channels = channelsOf(buffer);
  const plan = audioPlan(buffer.duration, videoSeconds, buffer.sampleRate);
  const data = Array.from({ length: channels }, (_, c) => applyFade(buffer.getChannelData(c), plan, buffer.sampleRate));
  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => onChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure({ ...encoderConfig(codec, channels), sampleRate: buffer.sampleRate });
  for (const { start, length } of chunkRanges(plan.frames)) {
    if (failure) throw failure;
    // f32-planar: every channel's samples one after the other.
    const planar = new Float32Array(length * channels);
    for (let c = 0; c < channels; c++) planar.set(data[c].subarray(start, start + length), c * length);
    const audio = new AudioData({
      format: "f32-planar",
      sampleRate: buffer.sampleRate,
      numberOfFrames: length,
      numberOfChannels: channels,
      timestamp: Math.round((start * 1_000_000) / buffer.sampleRate),
      data: planar,
    });
    encoder.encode(audio);
    audio.close();
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  return plan;
}

/** For the WebM fallback: a live audio track that plays the buffer with the same trim and fade. Call start() with the recording. */
export function playAudioIntoStream(buffer: AudioBuffer, videoSeconds: number): { track: MediaStreamTrack; start: () => void; stop: () => void } {
  const ctx = new AudioContext();
  const plan = audioPlan(buffer.duration, videoSeconds, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const dest = ctx.createMediaStreamDestination();
  source.connect(gain).connect(dest);
  return {
    track: dest.stream.getAudioTracks()[0],
    start: () => {
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(1, t0);
      if (plan.fadeStart < plan.seconds) {
        gain.gain.setValueAtTime(1, t0 + plan.fadeStart);
        gain.gain.linearRampToValueAtTime(0, t0 + plan.seconds);
      }
      source.start(t0, 0, plan.seconds);
    },
    stop: () => {
      try {
        source.stop();
      } catch {}
      void ctx.close();
    },
  };
}

