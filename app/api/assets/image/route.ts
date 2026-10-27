import { type NextRequest, NextResponse } from "next/server";

/**
 * Same-origin copy of a store screenshot, so the canvas that builds our screenshots
 * is not tainted by a cross-origin image. Only the stores' CDNs are allowed.
 */
const ALLOWED = [/\.mzstatic\.com$/, /\.googleusercontent\.com$/, /\.ggpht\.com$/, /\.gstatic\.com$/];

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    return NextResponse.json({ error: "URL no válida" }, { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED.some((re) => re.test(url.hostname))) {
    return NextResponse.json({ error: "Solo se pueden cargar imágenes de las tiendas" }, { status: 403 });
  }
  const upstream = await fetch(url, { headers: { accept: "image/*" }, next: { revalidate: 86400 } });
  if (!upstream.ok) return NextResponse.json({ error: `La tienda respondió ${upstream.status}` }, { status: 502 });
  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) return NextResponse.json({ error: "No es una imagen" }, { status: 502 });
  return new NextResponse(upstream.body, {
    headers: { "content-type": type, "cache-control": "public, max-age=86400" },
  });
}
