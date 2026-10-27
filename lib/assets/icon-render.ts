import { type IconSpec, SYMBOLS } from "./icon";

/** Draws the icon on a square canvas of side `size`. Browser only. */
export function drawIcon(ctx: CanvasRenderingContext2D, spec: IconSpec, size: number, fontFamily: string) {
  const s = size;
  ctx.clearRect(0, 0, s, s);

  // Background
  const { background: bg } = spec;
  if (bg.kind === "solid") {
    ctx.fillStyle = bg.from;
  } else if (bg.kind === "linear") {
    const rad = ((bg.angle - 90) * Math.PI) / 180;
    const dx = Math.cos(rad) * s;
    const dy = Math.sin(rad) * s;
    const g = ctx.createLinearGradient(s / 2 - dx / 2, s / 2 - dy / 2, s / 2 + dx / 2, s / 2 + dy / 2);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(s * 0.35, s * 0.3, s * 0.05, s / 2, s / 2, s * 0.8);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, s, s);

  if (spec.gloss) {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "rgba(255,255,255,0.22)");
    g.addColorStop(0.5, "rgba(255,255,255,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }

  // Plate
  if (spec.plate.kind !== "none") {
    const p = s * spec.plate.scale;
    const x = (s - p) / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = s * 0.04;
    ctx.shadowOffsetY = s * 0.015;
    ctx.fillStyle = spec.plate.color;
    ctx.beginPath();
    if (spec.plate.kind === "circle") ctx.arc(s / 2, s / 2, p / 2, 0, Math.PI * 2);
    else ctx.roundRect(x, x, p, p, p * 0.22);
    ctx.fill();
    ctx.restore();
  }

  // Glyph
  ctx.save();
  if (spec.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = s * 0.03;
    ctx.shadowOffsetY = s * 0.012;
  }
  ctx.fillStyle = spec.glyphColor;
  if (spec.glyph.kind === "letter") {
    const fontSize = s * spec.glyphScale;
    ctx.font = `${spec.glyph.weight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText(spec.glyph.text);
    // Centre on the glyph's real box, not the font's line box.
    const top = m.actualBoundingBoxAscent;
    const bottom = m.actualBoundingBoxDescent;
    ctx.fillText(spec.glyph.text, s / 2, s / 2 + (top - bottom) / 2);
  } else {
    const path = new Path2D(SYMBOLS[spec.glyph.name]);
    const glyph = s * spec.glyphScale;
    ctx.translate((s - glyph) / 2, (s - glyph) / 2);
    ctx.scale(glyph / 24, glyph / 24);
    ctx.fill(path, "evenodd");
  }
  ctx.restore();
}

export function renderIconPng(spec: IconSpec, size: number, fontFamily: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  drawIcon(ctx, spec, size, fontFamily);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo exportar el PNG"))), "image/png"));
}
