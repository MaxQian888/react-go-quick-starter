import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isProd = process.env.NODE_ENV === "production";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";

// Static export is only enabled when NEXT_OUTPUT_EXPORT=true. The `pnpm build`
// and `pnpm tauri:build` scripts set this; `pnpm build:web` and `pnpm dev` do not.
// Static export disables middleware and server features, so we only opt in for
// Tauri's bundled `out/` directory (see src-tauri/tauri.conf.json `frontendDist`).
const isStaticExport = process.env.NEXT_OUTPUT_EXPORT === "true";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" as const } : {}),
  images: { unoptimized: true },
  assetPrefix: isProd ? undefined : `http://${internalHost}:3000`,
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
