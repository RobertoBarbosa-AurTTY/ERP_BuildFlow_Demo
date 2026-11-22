import type { NextConfig } from "next";

// Front-end estático: por enquanto não há back-end conectado.
// Os dados vêm de src/lib/mock (em memória + localStorage).
// `next build` gera o site em web/out, publicado como arquivos estáticos no Netlify.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
