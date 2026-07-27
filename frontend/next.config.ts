import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to THIS project, using the real
  // on-disk path (correct drive-letter casing + separators) so the pin
  // actually matches. Otherwise Turbopack sees two sibling lockfiles
  // (traders-api / traders-diary) and falls back to the parent folder
  // "e:/Project/traders", where "tailwindcss" can't be resolved.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
