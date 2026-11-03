import type { NextConfig } from "next";
import { GLOBAL_REDIRECTS } from "./lib/redirects";

const nextConfig: NextConfig = {
  experimental: {
    // Keep visited pages in the browser for 30 s so going back to a tab is instant.
    // Server actions call revalidatePath, which clears this cache after any change.
    staleTimes: { dynamic: 30 },
    // Screenshot sets carry their images (base64) when they are saved.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Old global pages (/novedades, /resumen, /ajustes, /buscar) → their new ones, as 308s with the query kept.
  async redirects() {
    return [...GLOBAL_REDIRECTS];
  },
};

export default nextConfig;
