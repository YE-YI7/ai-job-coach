import type { MetadataRoute } from "next";
import { PUBLIC_INDEX_PATHS, PUBLIC_SITE_URL } from "@/lib/public-discovery";

export default function sitemap(): MetadataRoute.Sitemap {
  // No fabricated lastModified on every request/build.
  return PUBLIC_INDEX_PATHS.map((path) => ({ url: `${PUBLIC_SITE_URL}${path === "/" ? "" : path}` }));
}
