import type { NextConfig } from "next";

// Front-end estático: por enquanto não há back-end conectado.
// Os dados vêm de src/lib/mock (em memória + localStorage).
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
