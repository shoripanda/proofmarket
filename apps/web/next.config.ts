import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are TypeScript sources.
  transpilePackages: [
    "@proofmarket/core",
    "@proofmarket/db",
    "@proofmarket/solana",
    "@proofmarket/mcp",
    "@proofmarket/sdk",
  ],
  // PGlite (DEV_MODE only) resolves its wasm via import.meta.url, which breaks when bundled into the RSC graph.
  serverExternalPackages: ["sharp", "@electric-sql/pglite"],
  // Dev server only: lets a Cloudflare quick tunnel load dev assets and HMR (phone / claude.ai testing).
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 08 §1.4. No page may be framed (clickjacking on the worker app and the OAuth consent page). Script and
          // connect sources stay open for now: Privy and the Solana RPC pull from origins that change with their SDKs.
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // microphone: "話して入力" on the worker app (13 §6)
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
