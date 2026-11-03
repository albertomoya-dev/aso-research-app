import type { NextConfig } from "next";

/**
 * Old global pages → new ones (docs/REDISENO_UX.md §8), as 308s. Their destinations arrive in phase 27,
 * so they stay off until then: turn ENABLE_GLOBAL_REDIRECTS on in that phase. The app pages
 * (`/apps/[id]/…`) need the database and redirect from app/apps/[id]/[[...rest]]/route.ts instead.
 */
const ENABLE_GLOBAL_REDIRECTS = false;
const GLOBAL_REDIRECTS = [
  { source: "/novedades", destination: "/actividad", permanent: true },
  { source: "/resumen", destination: "/actividad?vista=semana", permanent: true },
  { source: "/ajustes", destination: "/integraciones", permanent: true },
  { source: "/buscar", destination: "/apps/nueva", permanent: true },
];

const nextConfig: NextConfig = {
  experimental: {
    // Keep visited pages in the browser for 30 s so going back to a tab is instant.
    // Server actions call revalidatePath, which clears this cache after any change.
    staleTimes: { dynamic: 30 },
    // Screenshot sets carry their images (base64) when they are saved.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async redirects() {
    return ENABLE_GLOBAL_REDIRECTS ? GLOBAL_REDIRECTS : [];
  },
};

export default nextConfig;
