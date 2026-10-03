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
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 08 §1.4: CSP. Tightened in PR-05 once Privy origins are known.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
