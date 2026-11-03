// @ts-nocheck — without @types/node installed, `process` and `node:*` do not type-check with @ts-check.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// `vite` is not a direct dependency (pnpm does not hoist it), so it is resolved
// from astro, which is what brings it in. It is the same Vite `loadEnv`.
const requireFromAstro = createRequire(
  createRequire(import.meta.url).resolve("astro/package.json"),
);
const { loadEnv } = await import(pathToFileURL(requireFromAstro.resolve("vite")).href);

// Backend URL for the Vite proxy: API_INTERNAL_URL (server only, never
// inlined into the client bundle), then PUBLIC_API_URL, from .env or the shell
// environment variable (the shell wins). Fallback to port 8000. No trailing slash.
const env = {
  ...loadEnv(
    process.env.NODE_ENV || "development",
    fileURLToPath(new URL(".", import.meta.url)),
    "",
  ),
  ...process.env,
};
const API_TARGET = (env.API_INTERNAL_URL || env.PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

// SSR so the auth check (Django cookies → /api/auth/me/) works on the server.
// Node standalone adapter — `pnpm dev` for dev, `pnpm build` + `node ./dist/server/entry.mjs` for prod.
// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false, // imported manually in src/styles/global.css
    }),
  ],

  server: {
    host: "127.0.0.1",
    port: 4321,
  },

  vite: {
    server: {
      // proxy /api to the backend in dev (target = API_INTERNAL_URL) — more convenient
      // than CORS for client-side fetches (the browser uses relative /api, so
      // the session cookie travels with the frontend origin). For SSR the server
      // uses `API_INTERNAL_URL` via `lib/auth-server.ts`.
      proxy: {
        "/api": {
          target: API_TARGET,
          changeOrigin: true,
        },
        // /media: files uploaded by users (sidebar_icon, attachments).
        // Same target as /api (API_INTERNAL_URL). Without this proxy, the <img src="/media/...">
        // would point at the frontend origin (4321) and return 404.
        "/media": {
          target: API_TARGET,
          changeOrigin: true,
        },
        // /mcp: MCP Streamable HTTP endpoint (served by uvicorn, not runserver). Same target
        // as /api, so "Test connection" and the MCP clients work with the app's origin.
        "/mcp": {
          target: API_TARGET,
          changeOrigin: true,
        },
      },
    },
  },
});
