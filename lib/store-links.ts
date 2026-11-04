import type { Store } from "./stores/types";

/**
 * The app of a store link pasted in a search box, or null when `text` is not one:
 * `https://play.google.com/store/apps/details?id=com.x.y&hl=es` → android `com.x.y`,
 * `https://apps.apple.com/es/app/nombre/id1234567890` → ios `1234567890`.
 */
export function storeLinkApp(text: string): { store: Store; id: string } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === "play.google.com" && url.pathname.startsWith("/store/apps/details")) {
    const id = url.searchParams.get("id")?.trim() ?? "";
    return /^[a-zA-Z][\w]*(\.[\w]+)+$/.test(id) ? { store: "android", id } : null;
  }
  if (host === "apps.apple.com" || host === "itunes.apple.com") {
    const id = /\/id(\d{6,})(?:$|[/?#])/.exec(url.pathname + "/")?.[1];
    return id ? { store: "ios", id } : null;
  }
  return null;
}
