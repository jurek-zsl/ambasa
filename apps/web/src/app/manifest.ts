import type { MetadataRoute } from "next";
import { TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ambasa",
    short_name: "Ambasa",
    description: TAGLINE,
    start_url: "/app",
    display: "standalone",
    background_color: "#0e0f11",
    theme_color: "#0e0f11",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
