import { siteUrl } from "@/lib/shared"
import { source } from "@/lib/source"
import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", ...source.getPages().map((page) => page.url)]
  return paths.map((path) => ({ url: new URL(path, siteUrl).toString() }))
}
