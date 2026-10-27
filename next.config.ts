import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep visited pages in the browser for 30 s so going back to a tab is instant.
    // Server actions call revalidatePath, which clears this cache after any change.
    staleTimes: { dynamic: 30 },
    // Screenshot sets carry their images (base64) when they are saved.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
