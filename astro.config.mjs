import { defineConfig } from "astro/config";

// Default: Cloudflare Pages at https://simplecrm-eny.pages.dev/ (served from the root).
// Override with SITE_URL and BASE_PATH to build for another host or sub-path.
const site = process.env.SITE_URL || "https://simplecrm-eny.pages.dev";
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
});
