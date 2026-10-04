import type { MetadataRoute } from "next";
import { PRIVATE_CRAWL_PATHS, PUBLIC_SITE_URL } from "@/lib/public-discovery";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_CRAWL_PATHS },
    sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
