// Web app manifest. iPhone only delivers Web Push to sites added to the home screen, which needs this file.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProofMarket",
    short_name: "ProofMarket",
    description: "近くのお店の「いま」を確かめて、報酬を受け取る",
    start_url: "/tasks",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
