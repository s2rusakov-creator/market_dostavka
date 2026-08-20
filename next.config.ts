import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Иначе Turbopack поднимается до C:\Users\Asa из-за постороннего package-lock.json.
  turbopack: { root: path.resolve(process.cwd()) },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "t.me" },
      // Публичные ссылки Supabase Storage: <project-ref>.supabase.co
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default withNextIntl(nextConfig);
