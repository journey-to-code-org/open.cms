import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadSitePackage } from "./scripts/site-package-fs.mjs";
import { buildSiteStylesheet, buildSiteThemeCss } from "./scripts/site-styles.mjs";
import { defineConfig, loadEnv } from "vite";

const require = createRequire(import.meta.url);
const { buildSite } = require("./scripts/content-site");

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");

function walkFiles(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolute, relative) : [relative];
  });
}

function getMapboxToken(environment) {
  const configPath = path.join(ROOT, "map-config.local.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
    return config.mapboxToken;
  }
  return environment.MAPBOX_TOKEN || environment.MAPBOX_PUBLIC_TOKEN;
}

function validateMapboxToken(token) {
  if (typeof token !== "string" || !/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Map configuration requires a public Mapbox token beginning with pk. Secret tokens are not allowed.");
  }
  return token;
}

function pwaManifest(site) {
  return {
    name: site.config.pwa.name, short_name: site.config.pwa.shortName,
    description: site.config.pwa.description, start_url: "./", display: "standalone",
    background_color: site.config.pwa.backgroundColor, theme_color: site.config.pwa.themeColor,
    icons: site.config.pwa.icons.map((src) => ({ src: src.startsWith("/") ? `.${src}` : src, sizes: src.includes("192") ? "192x192" : "512x512", type: "image/png" })),
  };
}

function sitePlugin(command, environment, loadedSite) {
  let generated;
  const getGenerated = () => generated ||= buildSite(loadedSite);
  return {
    name: "open-cms-site",
    resolveId(id) { if (id === "virtual:open-cms-site") return "\0virtual:open-cms-site"; },
    load(id) {
      if (id !== "\0virtual:open-cms-site") return;
      return `export default ${JSON.stringify({
        manifest: loadedSite.manifest, config: loadedSite.config, navigation: loadedSite.navigation,
        pages: loadedSite.pages, collections: loadedSite.collections, places: loadedSite.places,
        trails: loadedSite.trails, map: loadedSite.map, theme: loadedSite.theme, themeCss: buildSiteThemeCss(loadedSite),
        bounds: loadedSite.config.region.bounds,
      })};`;
    },
    transformIndexHtml(html, context) {
      const site = getGenerated();
      if (context.path === "/" || context.path.endsWith("index.html")) return site.homeHtml;
      if (context.path.endsWith("explore.html")) return site.exploreHtml;
      return html;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (pathname === "/site.css") {
          response.setHeader("Content-Type", "text/css; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(buildSiteStylesheet(loadedSite));
          return;
        }
        if (pathname === "/service-worker.js") {
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(`self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  await self.registration.unregister();
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith("chingu-adventures-") || name.startsWith("chingu-mapbox-"))
    .map(name => caches.delete(name)));
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(clients.map(client => client.navigate(client.url)));
})()));`);
          return;
        }
        if (pathname === "/site.js") {
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.end(fs.readFileSync(path.join(ROOT, "public", "site.js"), "utf8"));
          return;
        }
        if (pathname === "/manifest.webmanifest") {
          response.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          response.end(JSON.stringify(pwaManifest(loadedSite), null, 2));
          return;
        }
        if (pathname === "/map-config.json") {
          try {
            const token = getMapboxToken(environment);
            if (!token) return next();
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ mapboxToken: validateMapboxToken(token) }));
            return;
          } catch (error) {
            response.statusCode = 500;
            response.end(error.message);
            return;
          }
        }
        const site = getGenerated();
        const page = site.pages.find((entry) => (entry.route || `/${entry.name}`) === pathname);
        if (!page) return next();
        response.setHeader("Content-Type", page.name.endsWith(".xml") ? "application/xml" :
          page.name.endsWith(".txt") ? "text/plain; charset=utf-8" : "text/html; charset=utf-8");
        response.end(page.source);
      });
    },
    closeBundle() {
      if (command !== "build") return;
      const site = getGenerated();
      for (const page of site.pages) {
        const destination = path.join(DIST, page.name);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, page.source);
      }
      fs.writeFileSync(path.join(DIST, "site.css"), buildSiteStylesheet(loadedSite));
      fs.copyFileSync(path.join(ROOT, "public", "site.js"), path.join(DIST, "site.js"));
      fs.writeFileSync(path.join(DIST, "manifest.webmanifest"), JSON.stringify(pwaManifest(loadedSite), null, 2));

      const outputConfig = path.join(DIST, "map-config.json");
      const token = getMapboxToken(environment);
      if (token) {
        fs.writeFileSync(outputConfig, JSON.stringify({ mapboxToken: validateMapboxToken(token) }));
      } else {
        fs.rmSync(outputConfig, { force: true });
        console.warn("No map token configured. Set map-config.local.json, MAPBOX_PUBLIC_TOKEN, or deploy map-config.json separately to enable the basemap.");
      }

      const assets = walkFiles(DIST).filter((name) => name !== "service-worker.js" &&
        name !== "map-config.json" && !name.endsWith(".map")).sort();
      const viteAssets = path.join(DIST, "assets");
      const appChunk = fs.readdirSync(viteAssets).find((name) => /^explore-.*\.js$/.test(name));
      const appStyles = fs.readdirSync(viteAssets).filter((name) => /^explore-.*\.css$/.test(name));
      if (!appChunk) throw new Error("Vite did not emit the explorer application entry.");
      const explorePath = path.join(DIST, "explore.html");
      let exploreHtml = fs.readFileSync(explorePath, "utf8");
      const appStylesheets = appStyles.map((name) => `<link rel="stylesheet" href="./assets/${name}">`).join("");
      exploreHtml = exploreHtml.replace("</head>", `${appStylesheets}</head>`)
        .replace('<script type="module" src="./src/app.ts"></script>', `<script type="module" src="./assets/${appChunk}"></script>`);
      fs.writeFileSync(explorePath, exploreHtml);
      const hash = crypto.createHash("sha256");
      for (const name of assets) {
        hash.update(name);
        hash.update(fs.readFileSync(path.join(DIST, name)));
      }
      const worker = fs.readFileSync(path.join(ROOT, "src", "service-worker.js"), "utf8")
        .replaceAll("__SITE_ID__", loadedSite.manifest.id)
        .replace("__CACHE_VERSION__", hash.digest("hex").slice(0, 16))
        .replace("__PRECACHE_ASSETS__", JSON.stringify(assets.map((name) => `./${name}`)));
      fs.writeFileSync(path.join(DIST, "service-worker.js"), worker);
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const environment = { ...loadEnv(mode, ROOT, ""), ...process.env };
  const selectedSite = process.env.OPEN_CMS_SITE || path.join(ROOT, "sites", "demo-region");
  const loadedSite = loadSitePackage(selectedSite);
  return ({
  publicDir: loadedSite.paths.assets,
  plugins: [sitePlugin(command, environment, loadedSite)],
  cacheDir: process.env.OPEN_CMS_VITE_CACHE_DIR || undefined,
  define: {
    "import.meta.env.OPEN_CMS_THEME": JSON.stringify(loadedSite.theme),
  },
  server: { host: "localhost", port: 3000, strictPort: true },
  worker: { format: "es" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: { home: path.join(ROOT, "index.html"), explore: path.join(ROOT, "explore.html") } },
  },
  });
});
