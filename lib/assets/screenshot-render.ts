import {
  type Crop,
  getPreset,
  type FrameKind,
  type Line,
  type ScreenshotSpec,
  type Slide,
  type ScreenshotTheme,
  wrapWords,
} from "./screenshots";

/**
 * Draws one store screenshot on a 2D canvas context. Browser only (needs a canvas);
 * the layout maths is proportional to the canvas width so every preset looks alike.
 */

/** What goes on a device screen: an image, or a cut-out of one (the app screen inside a store composition). */
export type ScreenSource =
  | CanvasImageSource
  | { image: CanvasImageSource; crop: Crop };

export function screenSource(
  image: CanvasImageSource | null,
  crop: Crop | null | undefined,
): ScreenSource | null {
  if (!image) return null;
  return crop ? { image, crop } : image;
}

function sourceSize(image: CanvasImageSource): { w: number; h: number } {
  const w =
    "naturalWidth" in image
      ? image.naturalWidth
      : "videoWidth" in image
        ? image.videoWidth
        : (image as { width: number }).width;
  const h =
    "naturalHeight" in image
      ? image.naturalHeight
      : "videoHeight" in image
        ? image.videoHeight
        : (image as { height: number }).height;
  return { w: Number(w) || 0, h: Number(h) || 0 };
}

export type DrawOptions = {
  /** CSS font family stack; the app passes the one from `body` so Inter is used. */
  fontFamily: string;
  /** The generated backdrop named by spec.backgroundImage, already loaded; drawn under everything. */
  background?: CanvasImageSource | null;
};

/** Draws an image so it covers the whole rectangle, cropping the overflow (like CSS object-fit: cover). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw =
    "naturalWidth" in image
      ? image.naturalWidth
      : "videoWidth" in image
        ? image.videoWidth
        : (image as { width: number }).width;
  const ih =
    "naturalHeight" in image
      ? image.naturalHeight
      : "videoHeight" in image
        ? image.videoHeight
        : (image as { height: number }).height;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih);
  const dw = iw * k;
  const dh = ih * k;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

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

const STILL: SlideAnimation = {
  textAlpha: 1,
  textShift: 0,
  deviceZoom: 1,
  deviceShift: 0,
};

const FRAME_ASPECT: Record<FrameKind, number> = {
  iphone: 2.06,
  android: 2.12,
  ipad: 1.33,
  "android-tablet": 1.56,
};

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

export function paintBackground(
  ctx: CanvasRenderingContext2D,
  theme: ScreenshotTheme,
  w: number,
  h: number,
) {
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

type TextBlock = {
  headline: Line[];
  sub: Line[];
  headSize: number;
  subSize: number;
  height: number;
};

function measureText(
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  theme: ScreenshotTheme,
  w: number,
  opts: DrawOptions,
  textScale: number,
): TextBlock {
  const maxWidth = w * 0.85;
  const headSize = Math.round(w * 0.078 * textScale);
  const subSize = Math.round(w * 0.04 * Math.min(textScale, 1.15));
  ctx.font = font(theme.weight, headSize, opts.fontFamily);
  const headline = slide.headline.trim()
    ? wrapWords(slide.headline, maxWidth, (s) => ctx.measureText(s).width)
    : [];
  ctx.font = font(500, subSize, opts.fontFamily);
  const sub = slide.subheadline.trim()
    ? wrapWords(slide.subheadline, maxWidth, (s) => ctx.measureText(s).width)
    : [];
  const height =
    headline.length * headSize * 1.12 +
    (headline.length && sub.length ? headSize * 0.4 : 0) +
    sub.length * subSize * 1.35;
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

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  top: number,
  w: number,
  theme: ScreenshotTheme,
  opts: DrawOptions,
) {
  let y = top;
  if (block.headline.length) {
    ctx.font = font(theme.weight, block.headSize, opts.fontFamily);
    drawLines(
      ctx,
      block.headline,
      block.headSize,
      block.headSize * 1.12,
      y,
      w,
      theme,
      theme.text,
    );
    y +=
      block.headline.length * block.headSize * 1.12 +
      (block.sub.length ? block.headSize * 0.4 : 0);
  }
  if (block.sub.length) {
    ctx.font = font(500, block.subSize, opts.fontFamily);
    drawLines(
      ctx,
      block.sub,
      block.subSize,
      block.subSize * 1.35,
      y,
      w,
      theme,
      theme.subtext,
    );
  }
}

/**
 * A 1×1 canvas holding the average colour of a region of the image. It is built by drawing,
 * never by reading pixels, so it also works with images the page cannot read.
 */
function averageSwatch(
  image: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): CanvasImageSource | null {
  const make = (w: number, h: number) => {
    if (typeof OffscreenCanvas !== "undefined")
      return new OffscreenCanvas(w, h);
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  // Halve step by step so every source pixel is blended in, not just a few samples.
  let src: CanvasImageSource = image;
  let rect = { x: sx, y: sy, w: sw, h: sh };
  let w = Math.max(1, Math.ceil(sw));
  let h = Math.max(1, Math.ceil(sh));
  do {
    w = Math.max(1, Math.ceil(w / 2));
    h = Math.max(1, Math.ceil(h / 2));
    const c = make(w, h);
    const g = c?.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
      | undefined;
    if (!c || !g) return null;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
    src = c;
    rect = { x: 0, y: 0, w, h };
  } while (w > 1 || h > 1);
  return src;
}

function drawScreen(
  ctx: CanvasRenderingContext2D,
  screen: Rect,
  radius: number,
  source: ScreenSource | null,
) {
  ctx.save();
  roundRect(ctx, screen, radius);
  ctx.clip();
  if (source) {
    const cropped = "crop" in source && !("width" in source);
    const image = cropped
      ? (source as { image: CanvasImageSource }).image
      : (source as CanvasImageSource);
    const full = sourceSize(image);
    const crop = cropped
      ? (source as { crop: Crop }).crop
      : { x: 0, y: 0, w: 1, h: 1 };
    const sx = crop.x * full.w;
    const sy = crop.y * full.h;
    const iw = crop.w * full.w;
    const ih = crop.h * full.h;
    if (iw > 0 && ih > 0) {
      if (cropped) {
        // A screen cut out of a store composition: match the width so nothing is lost at the sides.
        // Phones in those compositions often run off the bottom of the image, so the cut is shorter
        // than a real screen; the gap below is filled with the average colour of the bottom of the
        // cut (the app's own background), with a short fade so a half-cut row does not end abruptly.
        const scale = screen.w / iw;
        const dh = ih * scale;
        ctx.drawImage(image, sx, sy, iw, ih, screen.x, screen.y, screen.w, dh);
        if (dh < screen.h - 0.5) {
          const strip = Math.max(1, Math.round(ih * 0.03));
          const swatch = averageSwatch(image, sx, sy + ih - strip, iw, strip);
          if (swatch) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            const fade = Math.min(dh * 0.25, screen.w * 0.08);
            const steps = 12;
            for (let i = 0; i < steps; i++) {
              ctx.globalAlpha = (i + 1) / steps;
              const y = screen.y + dh - fade + (fade * i) / steps;
              ctx.drawImage(
                swatch,
                0,
                0,
                1,
                1,
                screen.x,
                y,
                screen.w,
                fade / steps + 1,
              );
            }
            ctx.globalAlpha = 1;
            ctx.drawImage(
              swatch,
              0,
              0,
              1,
              1,
              screen.x,
              screen.y + dh - 1,
              screen.w,
              screen.h - dh + 1,
            );
            ctx.restore();
          }
        }
      } else {
        // Cover the screen, keeping the top edge (status bar) visible.
        const scale = Math.max(screen.w / iw, screen.h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(
          image,
          sx,
          sy,
          iw,
          ih,
          screen.x + (screen.w - dw) / 2,
          screen.y,
          dw,
          dh,
        );
      }
    }
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
    ctx.fillText(
      "Sube una captura",
      screen.x + screen.w / 2,
      screen.y + screen.h * 0.4,
    );
    ctx.textAlign = "start";
  }
  ctx.restore();
}

function drawDevice(
  ctx: CanvasRenderingContext2D,
  frame: FrameKind,
  outer: Rect,
  theme: ScreenshotTheme,
  image: ScreenSource | null,
  showFrame: boolean,
) {
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
  const radius =
    outer.w * (frame === "iphone" ? 0.145 : frame === "android" ? 0.12 : 0.06);
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
    ctx.fillRect(
      outer.x + outer.w - 1,
      outer.y + outer.h * 0.26,
      bw + 1,
      outer.h * 0.13,
    );
  } else if (frame === "android") {
    ctx.fillRect(
      outer.x + outer.w - 1,
      outer.y + outer.h * 0.2,
      bw + 1,
      outer.h * 0.12,
    );
    ctx.fillRect(
      outer.x + outer.w - 1,
      outer.y + outer.h * 0.35,
      bw + 1,
      outer.h * 0.07,
    );
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

  const screen = {
    x: outer.x + bezel,
    y: outer.y + bezel,
    w: outer.w - bezel * 2,
    h: outer.h - bezel * 2,
  };
  roundRect(ctx, screen, radius - bezel);
  ctx.fillStyle = "#000000";
  ctx.fill();
  drawScreen(ctx, screen, radius - bezel, image);

  ctx.fillStyle = "#050507";
  if (frame === "iphone") {
    const pill = {
      x: outer.x + outer.w / 2 - outer.w * 0.135,
      y: screen.y + outer.w * 0.028,
      w: outer.w * 0.27,
      h: outer.w * 0.078,
    };
    roundRect(ctx, pill, pill.h / 2);
    ctx.fill();
  } else if (frame === "android") {
    ctx.beginPath();
    ctx.arc(
      outer.x + outer.w / 2,
      screen.y + outer.w * 0.05,
      outer.w * 0.022,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Position of this slide in the set, so panoramic decorations continue across screenshots. */
export type SlidePosition = { index: number; count: number };

/** Background decoration, drawn between the background and the device. */
function drawDecor(
  ctx: CanvasRenderingContext2D,
  spec: ScreenshotSpec,
  w: number,
  h: number,
  device: Rect,
  pos: SlidePosition,
) {
  const { accent } = spec.theme;
  const light =
    spec.theme.background === "#ffffff" || spec.theme.background === "#f6f6f8";
  const soft = light ? withAlpha(accent, 0.12) : "rgba(255,255,255,0.08)";
  ctx.save();
  switch (spec.decor) {
    case "glow": {
      const cx = device.x + device.w / 2;
      const cy = device.y + device.h * 0.4;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.75);
      g.addColorStop(0, withAlpha(accent, 0.55));
      g.addColorStop(0.5, withAlpha(accent, 0.12));
      g.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "circles": {
      // Circle centres live in "set space" (x in widths), so neighbours share each circle.
      const circles = [
        { x: 0.15, y: 0.78, r: 0.55 },
        { x: 1.35, y: 0.2, r: 0.42 },
        { x: 2.6, y: 0.9, r: 0.6 },
        { x: 3.9, y: 0.3, r: 0.38 },
        { x: 5.1, y: 0.75, r: 0.5 },
        { x: 6.4, y: 0.15, r: 0.45 },
        { x: 7.7, y: 0.85, r: 0.55 },
        { x: 9.0, y: 0.35, r: 0.4 },
        { x: 10.2, y: 0.8, r: 0.5 },
      ];
      ctx.fillStyle = soft;
      for (const c of circles) {
        const x = (c.x - pos.index) * w;
        if (x + c.r * w < -w * 0.1 || x - c.r * w > w * 1.1) continue;
        ctx.beginPath();
        ctx.arc(x, c.y * h, c.r * w, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "blob": {
      ctx.fillStyle = withAlpha(accent, light ? 0.18 : 0.28);
      ctx.beginPath();
      const cx = device.x + device.w / 2;
      const cy = device.y + device.h * 0.35;
      const r = device.w * 0.62;
      ctx.moveTo(cx - r, cy);
      ctx.bezierCurveTo(
        cx - r,
        cy - r * 1.1,
        cx + r * 0.2,
        cy - r * 1.05,
        cx + r * 0.9,
        cy - r * 0.4,
      );
      ctx.bezierCurveTo(
        cx + r * 1.25,
        cy + r * 0.3,
        cx + r * 0.5,
        cy + r * 1.1,
        cx - r * 0.2,
        cy + r * 0.95,
      );
      ctx.bezierCurveTo(
        cx - r * 0.9,
        cy + r * 0.8,
        cx - r * 1.05,
        cy + r * 0.4,
        cx - r,
        cy,
      );
      ctx.fill();
      break;
    }
    case "stripes": {
      ctx.fillStyle = soft;
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-Math.PI / 6);
      const band = w * 0.22;
      for (let x = -w * 2 - (pos.index % 2) * band; x < w * 2; x += band * 2)
        ctx.fillRect(x, -h, band, h * 2);
      break;
    }
    case "dots": {
      ctx.fillStyle = light ? withAlpha(accent, 0.2) : "rgba(255,255,255,0.14)";
      const step = w * 0.07;
      const r = w * 0.006;
      for (let y = step / 2; y < h; y += step)
        for (let x = step / 2; x < w; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      break;
    }
    case "wave": {
      ctx.fillStyle = withAlpha(accent, 0.9);
      const top = h * 0.62;
      ctx.beginPath();
      ctx.moveTo(0, top + h * 0.05);
      ctx.bezierCurveTo(
        w * 0.3,
        top - h * 0.06,
        w * 0.6,
        top + h * 0.1,
        w,
        top - h * 0.02,
      );
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = withAlpha(
        spec.theme.background2 ?? spec.theme.background,
        0.35,
      );
      ctx.beginPath();
      ctx.moveTo(0, top + h * 0.12);
      ctx.bezierCurveTo(
        w * 0.35,
        top + h * 0.02,
        w * 0.65,
        top + h * 0.18,
        w,
        top + h * 0.06,
      );
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "card": {
      const pad = w * 0.06;
      const card = { x: pad, y: device.y - w * 0.07, w: w - pad * 2, h: h };
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = w * 0.05;
      ctx.shadowOffsetY = w * 0.015;
      roundRect(ctx, card, w * 0.06);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Draws a device rotated about its centre, so tilted layouts keep the shadow and frame intact. */
function drawDeviceTransformed(
  ctx: CanvasRenderingContext2D,
  frame: FrameKind,
  r: Rect,
  rotate: number,
  theme: ScreenshotTheme,
  image: ScreenSource | null,
  showFrame: boolean,
) {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  drawDevice(
    ctx,
    frame,
    { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h },
    theme,
    image,
    showFrame,
  );
  ctx.restore();
}

/** Draws a slide at the preset's full size. Scale the context first to render a preview. */
export function drawSlide(
  ctx: CanvasRenderingContext2D,
  spec: ScreenshotSpec,
  slide: Slide,
  image: ScreenSource | null,
  opts: DrawOptions,
  anim: SlideAnimation = STILL,
  size?: { width: number; height: number },
  pos: SlidePosition = { index: 0, count: 1 },
  /** Screen shown on the second device of a "pair" layout (usually the next slide's). */
  pairImage: ScreenSource | null = null,
) {
  const preset = getPreset(spec.device);
  const w = size?.width ?? preset.width;
  const h = size?.height ?? preset.height;
  const theme = spec.theme;
  paintBackground(ctx, theme, w, h);

  // A finished composition from the store: show it edge to edge and draw nothing on top.
  if (slide.asIs) {
    if (image)
      drawCover(
        ctx,
        "crop" in image && !("width" in image)
          ? (image as { image: CanvasImageSource }).image
          : (image as CanvasImageSource),
        0,
        0,
        w,
        h,
      );
    return;
  }

  if (spec.backgroundImage && opts.background) {
    drawCover(ctx, opts.background, 0, 0, w, h);
    if (spec.backgroundDim > 0) {
      ctx.save();
      ctx.globalAlpha = spec.backgroundDim;
      paintBackground(ctx, theme, w, h);
      ctx.restore();
    }
  }

  // Odd slides mirror the tilt and the shift so a set alternates left and right.
  const mirror = spec.alternate && pos.index % 2 === 1 ? -1 : 1;
  const rotate = spec.deviceRotate * mirror;
  const offsetX = spec.deviceOffsetX * mirror * w;
  const offsetY = (spec.deviceOffsetY ?? 0) * h;

  const text = (block: TextBlock, top: number) => {
    ctx.save();
    ctx.globalAlpha = anim.textAlpha;
    ctx.translate(0, anim.textShift * w);
    drawTextBlock(ctx, block, top, w, theme, opts);
    ctx.restore();
  };
  const device = (r: Rect) => {
    const z = anim.deviceZoom;
    const zoomed = {
      x: r.x + offsetX + (r.w * (1 - z)) / 2,
      y: r.y + offsetY + (r.h * (1 - z)) / 2 + anim.deviceShift * w,
      w: r.w * z,
      h: r.h * z,
    };
    drawDecor(ctx, spec, w, h, zoomed, pos);
    if (spec.pair) {
      // The companion sits behind, on the other side, slightly smaller and leaning the other way.
      const k = 0.88;
      const back = {
        x: zoomed.x - offsetX * 2.2 + (zoomed.w * (1 - k)) / 2,
        y: zoomed.y + zoomed.h * 0.08,
        w: zoomed.w * k,
        h: zoomed.h * k,
      };
      ctx.save();
      ctx.globalAlpha = 0.92;
      drawDeviceTransformed(
        ctx,
        preset.frame,
        back,
        -rotate * 0.6 + (spec.deviceRotate === 0 ? -4 * mirror : 0),
        theme,
        pairImage,
        spec.showFrame,
      );
      ctx.restore();
    }
    drawDeviceTransformed(
      ctx,
      preset.frame,
      zoomed,
      rotate,
      theme,
      image,
      spec.showFrame,
    );
  };

  const block = measureText(ctx, slide, theme, w, opts, spec.textScale);
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
    const deviceY =
      free > 0 ? textBottom + Math.min(free / 2, h * 0.04) : textBottom;
    device({ x: deviceX, y: deviceY, w: deviceW, h: deviceH });
  } else {
    const textTop = hasText ? h - topPad - block.height : h - topPad;
    const limit = hasText ? textTop - gap : textTop;
    const free = limit - deviceH;
    const deviceY =
      free > 0
        ? limit - deviceH - Math.min(free / 2, h * 0.04)
        : limit - deviceH;
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
export async function renderSlidePng(
  spec: ScreenshotSpec,
  slide: Slide,
  image: ScreenSource | null,
  opts: DrawOptions,
  pos: SlidePosition = { index: 0, count: 1 },
  pairImage: ScreenSource | null = null,
): Promise<Blob> {
  const preset = getPreset(spec.device);
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  drawSlide(
    ctx,
    spec,
    slide,
    image,
    opts,
    undefined,
    undefined,
    pos,
    pairImage,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo exportar el PNG"))),
      "image/png",
    ),
  );
}

/** Shrinks an uploaded screenshot so a whole set fits in one save (JPEG, max height 1800px). */
export async function shrinkImage(
  file: File,
  maxHeight = 1800,
): Promise<string> {
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

/**
 * A small JPEG of what a slide shows (its crop when it has one), for Claude to look at. 768 px on the
 * long side keeps the visible text readable and the request small.
 */
export function screenThumbnail(image: HTMLImageElement, crop: Crop | null | undefined, maxSide = 768): string {
  const sx = crop ? crop.x * image.naturalWidth : 0;
  const sy = crop ? crop.y * image.naturalHeight : 0;
  const sw = crop ? crop.w * image.naturalWidth : image.naturalWidth;
  const sh = crop ? crop.h * image.naturalHeight : image.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/** The real font stack of the page, so canvas text matches the UI (next/font renames Inter). */
export function pageFontFamily(): string {
  if (typeof document === "undefined") return "Inter, system-ui, sans-serif";
  return (
    getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif"
  );
}

export async function ensureFonts(family: string, weights: number[]) {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await Promise.all(
    weights.map((w) =>
      document.fonts.load(`${w} 32px ${family}`).catch(() => []),
    ),
  );
}
