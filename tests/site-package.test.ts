import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { parseSiteConfig, parseSiteManifest, validateSitePackageIdentity } from "../src/site-package";
import { validateCollections, validateGeneratedOutputPaths, validateNavigation, validateOutputPathSet, validatePages, validatePlaces } from "../shared/site-validation.mjs";
import { loadSitePackage, validateSitePackage } from "../scripts/site-package-fs.mjs";
import { buildSite } from "../scripts/content-site.js";
import { buildSiteStylesheet } from "../scripts/site-styles.mjs";
import { activeSiteFromArgs } from "../scripts/active-site.mjs";

function temporarySite(id = "demo-region"): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "open-cms-site-"));
  cpSync(path.resolve("sites", id), path.join(directory, "site"), { recursive: true });
  return path.join(directory, "site");
}

function readJson<T>(root: string, file: string): T {
  return JSON.parse(readFileSync(path.join(root, file), "utf8")) as T;
}

function writeJson(root: string, file: string, value: unknown): void {
  writeFileSync(path.join(root, file), `${JSON.stringify(value)}\n`);
}

test("pure parsers validate available site configs without filesystem context", () => {
  const ids = ["demo-region", ...(existsSync(path.resolve("sites/garrett-county")) ? ["garrett-county"] : [])];
  const packageIds = new Map<string, string>();
  for (const id of ids) {
    const root = path.resolve("sites", id);
    const manifest = parseSiteManifest(readJson(root, "manifest.json"));
    const site = parseSiteConfig(readJson(root, "site.json"));
    assert.equal(manifest.format, 1);
    assert.equal(validateSitePackageIdentity(site, manifest).id, manifest.id);
    assert.equal(validateSitePackage(root).manifest.id, manifest.id);
    const normalizedId = manifest.id.toLocaleLowerCase("en-US");
    assert.equal(packageIds.has(normalizedId), false, `Duplicate package ID '${manifest.id}' in site fixtures.`);
    packageIds.set(normalizedId, id);
    assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/);
  }
});

test("loaded runtime normalizes both packages and drives static identity and content", () => {
  const demo = loadSitePackage(path.resolve("sites/demo-region"));
  const garrettRoot = path.resolve("sites/garrett-county");
  const garrett = existsSync(garrettRoot) ? loadSitePackage(garrettRoot) : undefined;
  assert.equal(demo.places.length, 3);
  assert.equal(demo.places[0].name, "Juniper Overlook");
  assert.equal(demo.trails.hikes.length, 0);
  assert.equal(demo.paths.root, path.resolve("sites/demo-region"));
  const output = buildSite(demo);
  assert.match(output.homeHtml, /Pine Hollow Field Guide/);
  assert.match(output.homeHtml, /juniper-overlook\.html/);
  assert.match(output.pages.find((page: { name: string }) => page.name === "sitemap.xml").source, /pine-hollow\.example/);
  assert.ok(output.pages.some((page: { name: string }) => page.name === "fern-creek.html"));
  assert.doesNotMatch(output.homeHtml, /Garrett|Deep Creek|Maryland/);
  assert.match(demo.themeCss, /#352b45/);
  if (garrett) {
    assert.equal(garrett.places.length, 16);
    assert.equal(garrett.places[0].name, "Swallow Falls State Park");
    assert.ok(Array.isArray(garrett.places[0].activities));
    assert.match(garrett.themeCss, /\.home-hero/);
    assert.notEqual(garrett.themeCss, demo.themeCss);
    assert.equal(garrett.config.explorer?.eyebrow, "THE GREAT OUTDOORS, CLOSE TO HOME");
    assert.notEqual(demo.config.explorer?.eyebrow, garrett.config.explorer?.eyebrow);
    const garrettHtml = buildSite(garrett).homeHtml;
    const demoHtml = buildSite(demo).homeHtml;
    assert.match(garrettHtml, /hero-variant-landscape/);
    assert.match(garrettHtml, /src="\/images\/gcadv-home\.webp"/);
    assert.match(garrettHtml, /guide-grid--image-cards/);
    assert.match(demoHtml, /hero-variant-default/);
    assert.doesNotMatch(demoHtml, /Garrett|gcadv-home/);
    const garrettCss = buildSiteStylesheet(garrett);
    const demoCss = buildSiteStylesheet(demo);
    assert.notEqual(garrettCss, demoCss);
    assert.match(garrettCss, /\.hero-variant-landscape/);
    assert.match(demoCss, /#352b45/);
  }
  const untrusted = { ...demo, content: [{ ...demo.content[0], body: "<script>alert(1)</script><p onclick=\"run()\">Safe text</p><a href=\"javascript:alert(2)\">Bad link</a>" }] };
  const untrustedPage = buildSite(untrusted).pages.find((page: { name: string }) => page.name === `${demo.content[0].id}.html`).source;
  assert.doesNotMatch(untrustedPage, /<script>alert|onclick=|href="javascript:/);
  assert.match(untrustedPage, /Safe text/);
});

test("page presentation variants validate and render only contained package assets", () => {
  const root = temporarySite();
  try {
    const manifest = readJson<any>(root, "manifest.json");
    const pages = readJson<any>(root, manifest.pages);
    const collections = readJson<any>(root, manifest.collections);
    pages.home.sections[0].props = {
      title: "A safe landscape", variant: "landscape", image: "/images/hero.webp", imageAlt: "A wooded ridge",
    };
    pages.home.sections[1].props.variant = "image-cards";
    mkdirSync(path.join(root, "assets", "images"), { recursive: true });
    writeFileSync(path.join(root, "assets", "images", "hero.webp"), "fixture image bytes");
    writeJson(root, manifest.pages, pages);
    assert.equal(validatePages(pages, collections), pages);
    assert.doesNotThrow(() => validateSitePackage(root));
    const site = loadSitePackage(root);
    const home = buildSite(site).homeHtml;
    assert.match(home, /hero-variant-landscape/);
    assert.match(home, /src="\/images\/hero\.webp" alt="A wooded ridge"/);
    assert.match(home, /guide-grid--image-cards/);

    rmSync(path.join(root, "assets", "images", "hero.webp"));
    assert.throws(() => loadSitePackage(root), /missing package asset '\/images\/hero\.webp'/);
  } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
});

test("nested configured pages use depth-aware root links while root output stays unchanged", () => {
  const site = loadSitePackage(path.resolve("sites/demo-region"));
  site.pages.team = { route: "/about/team.html", sections: [{ component: "guide-collection", props: { collection: "trailheads" } }] };
  site.pages.guides = { route: "/guides/", sections: [{ component: "guide-collection", props: { collection: "trailheads" } }] };
  const generated = buildSite(site);
  const team = generated.pages.find((page: { name: string }) => page.name === "about/team.html").source;
  const guides = generated.pages.find((page: { name: string }) => page.name === "guides/index.html").source;
  assert.match(guides, /href="\.\.\/site\.css"/);
  assert.match(guides, /href="\.\.\/manifest\.webmanifest"/);
  assert.match(guides, /src="\.\.\/site\.js"/);
  assert.match(guides, /class="site-brand" href="\.\.\/"/);
  assert.match(guides, /href="\.\.\/#places"/);
  assert.match(guides, /href="\.\.\/fern-creek\.html"/);
  assert.match(team, /href="\.\.\/site\.css"/);
  assert.match(team, /class="site-brand" href="\.\.\/"/);
  assert.match(generated.homeHtml, /href="\.\/site\.css"/);
  assert.match(generated.homeHtml, /href="\.\/manifest\.webmanifest"/);
  assert.match(generated.homeHtml, /src="\.\/site\.js"/);
  assert.match(generated.homeHtml, /class="site-brand" href="\.\/"/);
});

test("configured output paths reject reserved files and page or article collisions", () => {
  const site = loadSitePackage(path.resolve("sites/demo-region"));
  const collections = site.collections;
  const makePage = (route: string) => ({ route, sections: [] });
  assert.throws(() => validatePages({ home: makePage("/"), explorer: makePage("/explore.html") }, collections), /reserved engine output/);
  assert.throws(() => validatePages({ home: makePage("/"), child: makePage("/explore.html/child") }, collections), /reserved engine output/);
  assert.throws(() => validatePages({ home: makePage("/"), styles: makePage("/site.css") }, collections), /reserved engine output/);
  assert.throws(() => validatePages({ home: makePage("/"), malformed: makePage("/about//team") }, collections), /safe absolute route/);
  assert.throws(() => validatePages({ home: makePage("/"), one: makePage("/guides/"), two: makePage("/guides/index.html") }, collections), /collides/);
  assert.throws(() => validatePages({ home: makePage("/"), file: makePage("/about"), child: makePage("/about/team.html") }, collections), /conflicts/);
  assert.throws(() => validateGeneratedOutputPaths({ ...site.pages, article: makePage("/fern-creek.html") }, site.content.map((item) => item.id)), /collides with Page 'article'/);
  assert.throws(() => validateGeneratedOutputPaths(site.pages, [...site.content.map((item) => item.id), "explore"]), /reserved engine output/);
  assert.throws(() => validateGeneratedOutputPaths(site.pages, site.content.map((item) => item.id), ["fern-creek.html"]), /collides with Markdown article 'fern-creek'/);
  assert.throws(() => validateOutputPathSet([
    { owner: "asset", path: "images/Hero.webp" },
    { owner: "asset", path: "images/hero.webp" },
  ]), /case-insensitive path collision/);
});

test("package assets cannot replace engine files or Vite bundled assets", () => {
  for (const relative of ["site.css", "site.js", "service-worker.js", "index.html", "explore.html", "assets/app.js"]) {
    const root = temporarySite();
    try {
      const target = path.join(root, "assets", ...relative.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "collision");
      assert.throws(() => validateSitePackage(root), new RegExp(`Site package 'demo-region' is invalid:.*(?:${relative.split("/").pop()}|Vite output directory)`));
    } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
  }
});

test("asset trees reject case-insensitive duplicate relative paths", () => {
  const root = temporarySite();
  try {
    const assets = path.join(root, "assets", "images");
    mkdirSync(assets, { recursive: true });
    writeFileSync(path.join(assets, "Hero.webp"), "upper");
    writeFileSync(path.join(assets, "hero.webp"), "lower");
    const entries = readdirSync(assets);
    if (entries.length > 1) assert.throws(() => validateSitePackage(root), /differ only by case/);
    else assert.throws(() => validateOutputPathSet([
      { owner: "Package asset", path: "images/Hero.webp" },
      { owner: "Package asset", path: "images/hero.webp" },
    ]), /case-insensitive path collision/);
  } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
});

test("content IDs and consumed front matter are safe and package-contained", () => {
  const root = temporarySite();
  try {
    const contentDir = path.join(root, "content");
    renameSync(path.join(contentDir, "fern-creek.md"), path.join(contentDir, "Fern Creek.md"));
    assert.throws(() => validateSitePackage(root), /lowercase kebab-case ID/);
  } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }

  const reservedContentRoot = temporarySite();
  try {
    writeFileSync(path.join(reservedContentRoot, "content", "explore.md"), "Reserved article output.");
    assert.throws(() => validateSitePackage(reservedContentRoot), /Markdown article 'explore'.*reserved engine output/);
  } finally { rmSync(path.dirname(reservedContentRoot), { recursive: true, force: true }); }

  for (const image of ["/images/missing.webp", "https://example.com/image.webp", "//example.com/image.webp", "/../secret.webp", "data:image/png;base64,AA=="]) {
    const packageRoot = temporarySite();
    try {
      const contentFile = path.join(packageRoot, "content", "fern-creek.md");
      const content = readFileSync(contentFile, "utf8").replace("title: Fern Creek", `title: Fern Creek\nimage: ${image}\nimageAlt: A safe description`);
      writeFileSync(contentFile, content);
      if (image === "/images/missing.webp") assert.throws(() => validateSitePackage(packageRoot), /Content 'fern-creek' image references missing package asset/);
      else assert.throws(() => validateSitePackage(packageRoot), /Content 'fern-creek' image must be a safe package asset path/);
    } finally { rmSync(path.dirname(packageRoot), { recursive: true, force: true }); }
  }

  const safeRoot = temporarySite();
  try {
    const imagePath = path.join(safeRoot, "assets", "images", "fern.webp");
    mkdirSync(path.dirname(imagePath), { recursive: true });
    writeFileSync(imagePath, "fixture image");
    const contentFile = path.join(safeRoot, "content", "fern-creek.md");
    writeFileSync(contentFile, readFileSync(contentFile, "utf8").replace("title: Fern Creek", "title: Fern Creek\nimage: /images/fern.webp\nimageAlt: A creekside trail"));
    assert.equal(validateSitePackage(safeRoot).manifest.id, "demo-region");
  } finally { rmSync(path.dirname(safeRoot), { recursive: true, force: true }); }
});

test("PWA icons must resolve to safe existing package assets", () => {
  const root = temporarySite();
  try {
    const site = readJson<any>(root, "site.json");
    site.pwa.icons = ["/icons/icon-192.png"];
    writeJson(root, "site.json", site);
    assert.throws(() => validateSitePackage(root), /PWA icon references missing package asset/);
    const icon = path.join(root, "assets", "icons", "icon-192.png");
    mkdirSync(path.dirname(icon), { recursive: true });
    writeFileSync(icon, "icon bytes");
    assert.equal(validateSitePackage(root).manifest.id, "demo-region");
    site.pwa.icons = ["https://example.com/icon.png"];
    writeJson(root, "site.json", site);
    assert.throws(() => validateSitePackage(root), /safe root-style package icon paths/);
  } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
});

test("package and site display identity must agree while package versions remain independent", () => {
  const root = temporarySite();
  try {
    const manifest = readJson<any>(root, "manifest.json");
    const site = readJson<any>(root, "site.json");
    manifest.version = "2.4.1-beta.2+build.17";
    writeJson(root, "manifest.json", manifest);
    assert.equal(validateSitePackage(root).manifest.version, "2.4.1-beta.2+build.17");
    site.name = "Another Display Name";
    writeJson(root, "site.json", site);
    assert.throws(() => validateSitePackage(root), /Site name must match the manifest name/);
  } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
});

test("page variants and unsafe hero asset references are rejected", () => {
  const root = path.resolve("sites/demo-region");
  const pages = readJson<any>(root, "pages.json");
  const collections = readJson<any>(root, "collections.json");
  const original = pages.home.sections[0].props;
  for (const image of ["../secret.jpg", "https://example.com/image.jpg", "//example.com/image.jpg", "javascript:alert(1)", "data:image/png;base64,AA==", "/images/%2e%2e/secret.jpg"]) {
    pages.home.sections[0].props = { title: "Test", image, imageAlt: "Image" };
    assert.throws(() => validatePages(pages, collections), /safe package asset path/);
  }
  pages.home.sections[0].props = { ...original, variant: "arbitrary-template" };
  assert.throws(() => validatePages(pages, collections), /hero variant must/);
  pages.home.sections[0].props = original;
  pages.home.sections[1].props.variant = "external-renderer";
  assert.throws(() => validatePages(pages, collections), /guide-collection variant must/);
});

test("Vite dev pages and stylesheet use the production package presentation pipeline", {
  skip: !existsSync(path.resolve("sites/garrett-county")),
}, async () => {
  const sitePath = path.resolve("sites/garrett-county");
  const originalSite = process.env.OPEN_CMS_SITE;
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    process.env.OPEN_CMS_SITE = sitePath;
    server = await createServer({
      configFile: path.resolve("vite.config.mjs"),
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address === "object");
    const origin = "http://127.0.0.1:" + address.port;
    const [homeResponse, articleResponse, cssResponse, imageResponse] = await Promise.all([
      fetch(origin), fetch(origin + "/swallow-falls.html"), fetch(origin + "/site.css"), fetch(origin + "/images/gcadv-home.webp"),
    ]);
    assert.equal(homeResponse.status, 200);
    assert.equal(articleResponse.status, 200);
    assert.equal(cssResponse.status, 200);
    assert.equal(imageResponse.status, 200);
    const [home, article, css] = await Promise.all([homeResponse.text(), articleResponse.text(), cssResponse.text()]);
    assert.match(home, /Garrett County Adventures/);
    assert.match(home, /hero-variant-landscape/);
    assert.match(home, /src="\/images\/gcadv-home\.webp"/);
    assert.match(home, /href="\.\/site\.css"/);
    assert.match(home, /Swallow Falls/);
    assert.match(article, /href="\.\/site\.css"/);
    assert.match(css, /--cms-accent:#c4973b/);
    assert.match(css, /\.hero-variant-landscape/);
    assert.equal(css, buildSiteStylesheet(loadSitePackage(sitePath)));
  } finally {
    if (server) await server.close();
    if (originalSite === undefined) delete process.env.OPEN_CMS_SITE;
    else process.env.OPEN_CMS_SITE = originalSite;
  }
});

test("active-site arguments accept package paths outside the engine checkout", () => {
  assert.equal(activeSiteFromArgs([]), path.resolve("sites/demo-region"));
  if (existsSync(path.resolve("sites/garrett-county"))) assert.equal(activeSiteFromArgs(["--site", "./sites/garrett-county"]), path.resolve("sites/garrett-county"));
  assert.equal(activeSiteFromArgs(["--site=sites/demo-region"]), path.resolve("sites/demo-region"));
  if (existsSync(path.resolve("sites/garrett-county"))) assert.equal(activeSiteFromArgs(["./sites/garrett-county"]), path.resolve("sites/garrett-county"));
  assert.throws(() => activeSiteFromArgs(["--site"]), /requires a package directory/);
  const externalSite = temporarySite();
  try {
    const selected = activeSiteFromArgs(["--site", path.relative(process.cwd(), externalSite)]);
    assert.equal(selected, path.resolve(externalSite));
    assert.equal(activeSiteFromArgs(["--site", externalSite]), path.resolve(externalSite));
    assert.equal(validateSitePackage(selected).manifest.id, "demo-region");
    const loaded = loadSitePackage(selected);
    assert.equal(loaded.config.name, "Pine Hollow Field Guide");
    const generated = buildSite(loaded);
    assert.match(generated.homeHtml, /Pine Hollow Field Guide/);
  } finally { rmSync(path.dirname(externalSite), { recursive: true, force: true }); }
});

test("navigation rejects executable and protocol-relative links", () => {
  assert.throws(() => validateNavigation({ items: [{ label: "Unsafe", href: "javascript:alert(1)" }] }), /safe link/);
  assert.throws(() => validateNavigation({ items: [{ label: "External", href: "//example.com" }] }), /safe link/);
  assert.equal(validateNavigation({ items: [{ label: "Guide", href: "/guide.html" }] }).items.length, 1);
});

test("application-facing validation imports no Node filesystem or path APIs", () => {
  const application = readFileSync("src/site-package.ts", "utf8");
  const pure = readFileSync("shared/site-validation.mjs", "utf8");
  assert.match(application, /\.\.\/shared\/site-validation\.mjs/);
  assert.doesNotMatch(`${application}\n${pure}`, /from\s+["']node:(?:fs|path|url)["']/);
});

test("manifest rejects unsupported format, invalid ids, and malformed semantic versions", () => {
  for (const [file, mutation, message] of [
    ["format", (x: any) => ({ ...x, format: 2 }), /format 1/],
    ["id", (x: any) => ({ ...x, id: "Demo_Region" }), /kebab-case/],
    ["version", (x: any) => ({ ...x, version: "1.0" }), /semantic version/],
    ["version-prerelease", (x: any) => ({ ...x, version: "1.0.0-01" }), /semantic version/],
  ] as const) {
    const root = temporarySite();
    try {
      const manifest = readJson<any>(root, "manifest.json");
      assert.throws(() => parseSiteManifest(mutation(manifest)), message, file);
    } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
  }
});

test("Node package loader rejects absolute, traversal, missing, wrong-kind and symlink-escaped paths", (t) => {
  const root = temporarySite();
  t.after(() => rmSync(path.dirname(root), { recursive: true, force: true }));
  const manifest = readJson<any>(root, "manifest.json");
  writeJson(root, "manifest.json", { ...manifest, places: "/tmp/places.geojson" });
  assert.throws(() => validateSitePackage(root), /safe relative path/);
  writeJson(root, "manifest.json", { ...manifest, places: "C:/outside.geojson" });
  assert.throws(() => validateSitePackage(root), /safe relative path/);
  writeJson(root, "manifest.json", { ...manifest, places: "../places.geojson" });
  assert.throws(() => validateSitePackage(root), /safe relative path/);
  writeJson(root, "manifest.json", { ...manifest, themeCss: "../theme.css" });
  assert.throws(() => validateSitePackage(root), /themeCss.*safe relative path/);
  writeJson(root, "manifest.json", { ...manifest, places: "missing/places.geojson" });
  assert.throws(() => validateSitePackage(root), /Missing package entry/);
  writeJson(root, "manifest.json", { ...manifest, assets: "manifest.json" });
  assert.throws(() => validateSitePackage(root), /wrong kind/);
  writeJson(root, "manifest.json", manifest);

  const themeFile = path.join(root, manifest.themeCss.replace(/^\.\//, ""));
  const originalTheme = readFileSync(themeFile, "utf8");
  writeFileSync(themeFile, ".x { background: url(https://example.invalid/x); }");
  assert.throws(() => loadSitePackage(root), /cannot import styles or reference external resources/);
  writeFileSync(themeFile, originalTheme);

  const outside = path.join(path.dirname(root), "outside-assets");
  mkdirSync(outside);
  const assetPath = path.join(root, "assets");
  rmSync(assetPath, { recursive: true, force: true });
  try {
    symlinkSync(outside, assetPath, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => validateSitePackage(root), /Resolved package path 'assets' escapes/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "EACCES") {
      t.skip("The current account cannot create directory symlinks for this test.");
    } else throw error;
  }
});

test("site id must match manifest and region fields and bounds must be valid", () => {
  const root = path.resolve("sites/demo-region");
  const site = readJson<any>(root, "site.json");
  const manifest = readJson<any>(root, "manifest.json");
  assert.throws(() => validateSitePackageIdentity({ ...site, id: "other-site" }, manifest), /match the manifest/);
  const invalid = [
    { ...site, name: "  " }, { ...site, locale: "" },
    { ...site, region: { ...site.region, name: "" } },
    { ...site, region: { ...site.region, bounds: [[0, 0]] } },
    { ...site, region: { ...site.region, bounds: [[0, 0], [1, Number.NaN]] } },
    { ...site, region: { ...site.region, bounds: [[-181, 0], [1, 1]] } },
    { ...site, region: { ...site.region, bounds: [[1, 0], [0, 1]] } },
    { ...site, region: { ...site.region, bounds: [[0, 2], [1, 1]] } },
  ];
  for (const value of invalid) assert.throws(() => parseSiteConfig(value));
});

test("places reject duplicate IDs, missing shape, and invalid coordinates", () => {
  const root = path.resolve("sites/demo-region");
  const places = readJson<any>(root, "data/places.geojson");
  assert.equal(validatePlaces(places), places);
  assert.throws(() => validatePlaces({ ...places, features: [places.features[0], places.features[0]] }), /Duplicate place id/);
  for (const coordinates of [[181, 0], [0, -91], [Number.NaN, 0], [0, Number.POSITIVE_INFINITY]]) {
    const feature = { ...places.features[0], geometry: { type: "Point", coordinates } };
    assert.throws(() => validatePlaces({ ...places, features: [feature] }), /invalid longitude\/latitude/);
  }
  assert.throws(() => validatePlaces({ ...places, features: [{ ...places.features[0], id: undefined }] }), /requires a .* id/);
  assert.throws(() => validatePlaces({ ...places, features: [{ ...places.features[0], geometry: null }] }), /Point geometry/);
});

test("collections require unique string content IDs that resolve to Markdown", () => {
  const root = path.resolve("sites/demo-region");
  const content = path.join(root, "content");
  const contentIds = new Set(readdirSync(content).filter((name) => name.endsWith(".md")).map((name) => path.basename(name, ".md")));
  const collections = readJson<any>(root, "collections.json");
  assert.equal(validateCollections(collections, contentIds), collections);
  assert.throws(() => validateCollections({ x: { title: "X", items: ["juniper-overlook", "juniper-overlook"] } }, contentIds), /duplicate item/);
  assert.throws(() => validateCollections({ x: { title: "X", items: ["missing-guide"] } }, contentIds), /missing Markdown/);
  assert.throws(() => validateCollections({ x: { title: "X", items: [4] } }, contentIds), /non-empty strings/);
  assert.throws(() => validateCollections({ x: { title: "X", items: "juniper-overlook" } }, contentIds), /must be an array/);
});

test("pages reject unknown collections, malformed section data, and unregistered components", () => {
  const root = path.resolve("sites/demo-region");
  const pages = readJson<any>(root, "pages.json");
  const collections = readJson<any>(root, "collections.json");
  assert.equal(validatePages(pages, collections), pages);
  assert.throws(() => validatePages({ home: { route: "/", sections: [{ component: "guide-collection", props: { collection: "missing" } }] } }, collections), /unknown guide collection/);
  assert.throws(() => validatePages({ home: { route: "/", sections: [{ component: "mystery-widget" }] } }, collections), /unknown component/);
  assert.throws(() => validatePages({ home: { route: "/", sections: [{ component: "hero", props: "not-object" }] } }, collections), /props must be an object/);
  assert.throws(() => validatePages({ home: { route: "/", sections: {} } }, collections), /sections must be an array/);
});

test("full package validation catches broken cross-references", () => {
  const root = temporarySite();
  try {
    const collections = readJson<any>(root, "collections.json");
    collections.trailheads.items.push("missing-guide");
    writeJson(root, "collections.json", collections);
    assert.throws(() => validateSitePackage(root), /missing Markdown/);
  } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }

  const anotherRoot = temporarySite();
  try {
    const manifest = readJson<any>(anotherRoot, "manifest.json");
    const site = readJson<any>(anotherRoot, "site.json");
    site.id = "does-not-match";
    writeJson(anotherRoot, manifest.site, site);
    assert.throws(() => validateSitePackage(anotherRoot), /match the manifest/);
  } finally { rmSync(path.dirname(anotherRoot), { recursive: true, force: true }); }
});
