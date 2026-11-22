import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_URL || "https://ai-revenue-recovery-weld-one.vercel.app";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacy", "/terms"], disallow: ["/app", "/api", "/onboarding", "/reset-password"] }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
