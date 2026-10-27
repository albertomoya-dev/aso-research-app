import { getPreset, type FrameKind, type Line, type ScreenshotSpec, type Slide, type ScreenshotTheme, wrapWords } from "./screenshots";

/**
 * Draws one store screenshot on a 2D canvas context. Browser only (needs a canvas);
 * the layout maths is proportional to the canvas width so every preset looks alike.
 */

export type DrawOptions = {
  /** CSS font family stack; the app passes the one from `body` so Inter is used. */
  fontFamily: string;
};

/** Per-frame tweaks for the promo video: text fades and slides in, the device zooms gently. */
export type SlideAnimation = {
  textAlpha: number;
  /** Vertical offset of the text block, as a fraction of the canvas width. */
  textShift: number;
  /** 1 = normal size; the device scales around its centre. */
  deviceZoom: number;
  /** Vertical offset of the device, as a fraction of the canvas width. */
  deviceShift: number;
};

const STILL: SlideAnimation = { textAlpha: 1, textShift: 0, deviceZoom: 1, deviceShift: 0 };

const FRAME_ASPECT: Record<FrameKind, number> = { iphone: 2.06, android: 2.12, ipad: 1.33, "android-tablet": 1.56 };

type Rect = { x: number; y: number; w: number; h: number };

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

export function paintBackground(ctx: CanvasRenderingContext2D, theme: ScreenshotTheme, w: number, h: number) {
  if (theme.background2) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.background);
    g.addColorStop(1, theme.background2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = theme.background;
  }
  ctx.fillRect(0, 0, w, h);
}

function font(weight: number, size: number, family: string) {
  return `${weight} ${size}px ${family}`;
}

type TextBlock = { headline: Line[]; sub: Line[]; headSize: number; subSize: number; height: number };

function measureText(ctx: CanvasRenderingContext2D, slide: Slide, theme: ScreenshotTheme, w: number, opts: DrawOptions): TextBlock {
  const maxWidth = w * 0.85;
  const headSize = Math.round(w * 0.078);
  const subSize = Math.round(w * 0.04);
  ctx.font = font(theme.weight, headSize, opts.fontFamily);
  const headline = slide.headline.trim() ? wrapWords(slide.headline, maxWidth, (s) => ctx.measureText(s).width) : [];
  ctx.font = font(500, subSize, opts.fontFamily);
  const sub = slide.subheadline.trim() ? wrapWords(slide.subheadline, maxWidth, (s) => ctx.measureText(s).width) : [];
  const height = headline.length * headSize * 1.12 + (headline.length && sub.length ? headSize * 0.4 : 0) + sub.length * subSize * 1.35;
  return { headline, sub, headSize, subSize, height };
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: Line[],
  size: number,
  lineHeight: number,
  top: number,
  w: number,
  theme: ScreenshotTheme,
  color: string,
) {
  const space = ctx.measureText(" ").width;
  let y = top;
  for (const line of lines) {
    const widths = line.map((word) => ctx.measureText(word.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (line.length - 1);
    let x = theme.align === "center" ? (w - total) / 2 : w * 0.075;
    ctx.textBaseline = "alphabetic";
    line.forEach((word, i) => {
      ctx.fillStyle = word.accent ? theme.accent : color;
      ctx.fillText(word.text, x, y + size * 0.82);
      x += widths[i] + space;
    });
    y += lineHeight;
  }
}

function drawTextBlock(ctx: CanvasRenderingContext2D, block: TextBlock, top: number, w: number, theme: ScreenshotTheme, opts: DrawOptions) {
  let y = top;
  if (block.headline.length) {
    ctx.font = font(theme.weight, block.headSize, opts.fontFamily);
    drawLines(ctx, block.headline, block.headSize, block.headSize * 1.12, y, w, theme, theme.text);
    y += block.headline.length * block.headSize * 1.12 + (block.sub.length ? block.headSize * 0.4 : 0);
  }
  if (block.sub.length) {
    ctx.font = font(500, block.subSize, opts.fontFamily);
    drawLines(ctx, block.sub, block.subSize, block.subSize * 1.35, y, w, theme, theme.subtext);
  }
}

function drawScreen(ctx: CanvasRenderingContext2D, screen: Rect, radius: number, image: CanvasImageSource | null) {
  ctx.save();
  roundRect(ctx, screen, radius);
  ctx.clip();
  if (image) {
    const iw = "naturalWidth" in image ? image.naturalWidth : (image as ImageBitmap).width;
    const ih = "naturalHeight" in image ? image.naturalHeight : (image as ImageBitmap).height;
    // Cover the screen, keeping the top edge (status bar) visible.
    const scale = Math.max(screen.w / iw, screen.h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, screen.x + (screen.w - dw) / 2, screen.y, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, screen.y, 0, screen.y + screen.h);
    g.addColorStop(0, "#f4f4f7");
    g.addColorStop(1, "#dfe0e6");
    ctx.fillStyle = g;
    ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
    ctx.fillStyle = "#9a9ea8";
    ctx.font = `500 ${Math.round(screen.w * 0.05)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sube una captura", screen.x + screen.w / 2, screen.y + screen.h * 0.4);
    ctx.textAlign = "start";
  }
  ctx.restore();
}

function drawDevice(ctx: CanvasRenderingContext2D, frame: FrameKind, outer: Rect, theme: ScreenshotTheme, image: CanvasImageSource | null, showFrame: boolean) {
  const dark = theme.frame === "dark";
  if (!showFrame) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = outer.w * 0.08;
    ctx.shadowOffsetY = outer.w * 0.03;
    roundRect(ctx, outer, outer.w * 0.06);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    drawScreen(ctx, outer, outer.w * 0.06, image);
    return;
  }
  const isTablet = frame === "ipad" || frame === "android-tablet";
  const radius = outer.w * (frame === "iphone" ? 0.145 : frame === "android" ? 0.12 : 0.06);
  const bezel = outer.w * (isTablet ? 0.03 : frame === "iphone" ? 0.03 : 0.022);

  // Side buttons sit just outside the body.
  ctx.fillStyle = dark ? "#2a2a30" : "#c9c9cf";
  const bw = outer.w * 0.012;
  if (frame === "iphone") {
    for (const [y, h] of [
      [0.17, 0.045],
      [0.235, 0.085],
      [0.335, 0.085],
    ]) {
      ctx.fillRect(outer.x - bw, outer.y + outer.h * y, bw + 1, outer.h * h);
    }
    ctx.fillRect(outer.x + outer.w - 1, outer.y + outer.h * 0.26, bw + 1, outer.h * 0.13);
  } else if (frame === "android") {
    ctx.fillRect(outer.x + outer.w - 1, outer.y + outer.h * 0.2, bw + 1, outer.h * 0.12);
    ctx.fillRect(outer.x + outer.w - 1, outer.y + outer.h * 0.35, bw + 1, outer.h * 0.07);
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = outer.w * 0.1;
  ctx.shadowOffsetY = outer.w * 0.035;
  roundRect(ctx, outer, radius);
  ctx.fillStyle = dark ? "#17171b" : "#e9e9ee";
  ctx.fill();
  ctx.restore();
  // A thin highlight makes the body read as metal instead of a flat shape.
  roundRect(ctx, outer, radius);
  ctx.lineWidth = Math.max(2, outer.w * 0.004);
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)";
  ctx.stroke();

  const screen = { x: outer.x + bezel, y: outer.y + bezel, w: outer.w - bezel * 2, h: outer.h - bezel * 2 };
  roundRect(ctx, screen, radius - bezel);
  ctx.fillStyle = "#000000";
  ctx.fill();
  drawScreen(ctx, screen, radius - bezel, image);

  ctx.fillStyle = "#050507";
  if (frame === "iphone") {
    const pill = { x: outer.x + outer.w / 2 - outer.w * 0.135, y: screen.y + outer.w * 0.028, w: outer.w * 0.27, h: outer.w * 0.078 };
    roundRect(ctx, pill, pill.h / 2);
    ctx.fill();
  } else if (frame === "android") {
    ctx.beginPath();
    ctx.arc(outer.x + outer.w / 2, screen.y + outer.w * 0.05, outer.w * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draws a slide at the preset's full size. Scale the context first to render a preview. */
export function drawSlide(
  ctx: CanvasRenderingContext2D,
  spec: ScreenshotSpec,
  slide: Slide,
  image: CanvasImageSource | null,
  opts: DrawOptions,
  anim: SlideAnimation = STILL,
  size?: { width: number; height: number },
) {
  const preset = getPreset(spec.device);
  const w = size?.width ?? preset.width;
  const h = size?.height ?? preset.height;
  const theme = spec.theme;
  paintBackground(ctx, theme, w, h);

  const text = (block: TextBlock, top: number) => {
    ctx.save();
    ctx.globalAlpha = anim.textAlpha;
    ctx.translate(0, anim.textShift * w);
    drawTextBlock(ctx, block, top, w, theme, opts);
    ctx.restore();
  };
  const device = (r: Rect) => {
    const z = anim.deviceZoom;
    const zoomed = { x: r.x + (r.w * (1 - z)) / 2, y: r.y + (r.h * (1 - z)) / 2 + anim.deviceShift * w, w: r.w * z, h: r.h * z };
    drawDevice(ctx, preset.frame, zoomed, theme, image, spec.showFrame);
  };

  const block = measureText(ctx, slide, theme, w, opts);
  const topPad = h * 0.065;
  const gap = w * 0.07;
  const deviceW = w * spec.deviceScale;
  const deviceH = deviceW * FRAME_ASPECT[preset.frame];
  const deviceX = (w - deviceW) / 2;
  const hasText = block.height > 0;

  if (slide.layout === "text-top") {
    if (hasText) text(block, topPad);
    const textBottom = hasText ? topPad + block.height + gap : topPad;
    const free = h - textBottom - deviceH;
    // Centre a device that fits; otherwise let it run off the bottom edge, as store sets usually do.
    const deviceY = free > 0 ? textBottom + Math.min(free / 2, h * 0.04) : textBottom;
    device({ x: deviceX, y: deviceY, w: deviceW, h: deviceH });
  } else {
    const textTop = hasText ? h - topPad - block.height : h - topPad;
    const limit = hasText ? textTop - gap : textTop;
    const free = limit - deviceH;
    const deviceY = free > 0 ? limit - deviceH - Math.min(free / 2, h * 0.04) : limit - deviceH;
    device({ x: deviceX, y: deviceY, w: deviceW, h: deviceH });
    if (hasText) text(block, textTop);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/** Renders the slide at full size and returns a PNG. */
export async function renderSlidePng(spec: ScreenshotSpec, slide: Slide, image: CanvasImageSource | null, opts: DrawOptions): Promise<Blob> {
  const preset = getPreset(spec.device);
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  drawSlide(ctx, spec, slide, image, opts);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo exportar el PNG"))), "image/png"));
}

/** Shrinks an uploaded screenshot so a whole set fits in one save (JPEG, max height 1800px). */
export async function shrinkImage(file: File, maxHeight = 1800): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxHeight / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The real font stack of the page, so canvas text matches the UI (next/font renames Inter). */
export function pageFontFamily(): string {
  if (typeof document === "undefined") return "Inter, system-ui, sans-serif";
  return getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif";
}

export async function ensureFonts(family: string, weights: number[]) {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await Promise.all(weights.map((w) => document.fonts.load(`${w} 32px ${family}`).catch(() => [])));
}
