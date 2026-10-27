import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { drawSlide, type DrawOptions } from "./screenshot-render";
import { getPreset, type ScreenshotSpec } from "./screenshots";
import { getVideoPreset, layersAt, totalDuration, type VideoSettings } from "./video";

/**
 * Renders the promo video in the browser: WebCodecs (H.264) muxed into an MP4, which is what
 * App Store Connect and YouTube take; browsers without VideoEncoder fall back to a WebM
 * recorded in real time.
 */

export type EncodeInput = {
  spec: ScreenshotSpec;
  images: Map<string, CanvasImageSource>;
  settings: VideoSettings;
  opts: DrawOptions;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type EncodeResult = { blob: Blob; extension: "mp4" | "webm"; seconds: number };

export function canEncodeMp4(): boolean {
  return typeof VideoEncoder !== "undefined";
}

/**
 * Draws the frame at `t` seconds. The screenshot set is scaled to fit the video's width;
 * `outputScale` shrinks the whole frame for a preview canvas.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, t: number, input: EncodeInput, width: number, height: number, outputScale = 1) {
  const { spec, settings } = input;
  const preset = getPreset(spec.device);
  // Same aspect as the screenshots: fit by width, centre vertically (square and portrait presets).
  const scale = width / preset.width;
  const setHeight = preset.height * scale;
  const offsetY = (height - setHeight) / 2;
  ctx.save();
  ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  ctx.fillStyle = spec.theme.background;
  ctx.fillRect(0, 0, width, height);
  for (const layer of layersAt(t, settings, spec.slides.length)) {
    const slide = spec.slides[layer.slide];
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    ctx.translate(layer.shiftX * width, offsetY);
    ctx.scale(scale, scale);
    // Clip to the slide so a sliding neighbour never paints over it.
    ctx.beginPath();
    ctx.rect(0, 0, preset.width, preset.height);
    ctx.clip();
    const next = spec.slides[(layer.slide + 1) % spec.slides.length];
    const img = (src: string | null) => (src && input.images.get(src)) || null;
    drawSlide(ctx, spec, slide, img(slide.image), input.opts, layer.anim, undefined, { index: layer.slide, count: spec.slides.length }, img(next.image));
    ctx.restore();
  }
  ctx.restore();
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  return { canvas, ctx };
}

/** H.264 High profile, level 4.0: enough for 1080×1920 at 30 fps. */
function mp4Config(width: number, height: number, fps: number): VideoEncoderConfig {
  return { codec: "avc1.640028", width, height, bitrate: 10_000_000, framerate: fps, avc: { format: "avc" } };
}

export async function encodeVideo(input: EncodeInput): Promise<EncodeResult> {
  const preset = getVideoPreset(input.settings.preset);
  const seconds = totalDuration(input.settings, input.spec.slides.length);
  const mp4 = canEncodeMp4() && (await VideoEncoder.isConfigSupported(mp4Config(preset.width, preset.height, input.settings.fps))).supported;
  const result = mp4 ? await encodeMp4(input, preset.width, preset.height, seconds) : await recordWebm(input, preset.width, preset.height, seconds);
  return { ...result, seconds };
}

async function encodeMp4(input: EncodeInput, width: number, height: number, seconds: number): Promise<{ blob: Blob; extension: "mp4" }> {
  const fps = input.settings.fps;
  const frames = Math.round(seconds * fps);
  const { canvas, ctx } = makeCanvas(width, height);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(mp4Config(width, height, fps));

  for (let i = 0; i < frames; i++) {
    if (input.signal?.aborted) {
      encoder.close();
      throw new DOMException("Cancelado", "AbortError");
    }
    if (failure) throw failure;
    drawFrame(ctx, i / fps, input, width, height);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / fps), duration: Math.round(1_000_000 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // Keep the encoder queue short so memory stays flat and the UI can repaint.
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (i % fps === 0) {
      input.onProgress?.(i / frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  input.onProgress?.(1);
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), extension: "mp4" };
}

/** Real-time fallback: plays the frames on a canvas and records the stream. */
function recordWebm(input: EncodeInput, width: number, height: number, seconds: number): Promise<{ blob: Blob; extension: "webm" }> {
  return new Promise((resolve, reject) => {
    const fps = input.settings.fps;
    const { canvas, ctx } = makeCanvas(width, height);
    const stream = canvas.captureStream(fps);
    const mime = ["video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => resolve({ blob: new Blob(chunks, { type: "video/webm" }), extension: "webm" });
    recorder.onerror = () => reject(new Error("No se pudo grabar el vídeo"));
    const start = performance.now();
    drawFrame(ctx, 0, input, width, height);
    recorder.start();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (input.signal?.aborted) {
        recorder.stop();
        reject(new DOMException("Cancelado", "AbortError"));
        return;
      }
      if (t >= seconds) {
        recorder.stop();
        input.onProgress?.(1);
        return;
      }
      drawFrame(ctx, t, input, width, height);
      input.onProgress?.(t / seconds);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
