import type { MetadataRoute } from "next";
import { site } from "@/lib/public";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/channels", "/a/", "/docs"], disallow: ["/api/", "/app", "/device", "/login"] }],
    sitemap: `${site()}/sitemap.xml`,
  };
}
