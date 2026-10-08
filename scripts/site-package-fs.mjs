import fs from "node:fs";
import path from "node:path";
import {
  validateCollections,
  validateManifestData,
  validateNavigation,
  validatePages,
  validateGeneratedOutputPaths,
  validatePlaces,
  validateSiteConfig,
  validateSiteIdentity,
  validatePublicAssetPath,
} from "../shared/site-validation.mjs";

const pathInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
};

function validateAssetReference(value, assetsRoot, context) {
  if (!validatePublicAssetPath(value)) throw new Error(`${context} must be a safe package asset path beginning with '/'.`);
  const candidate = path.resolve(assetsRoot, ...value.slice(1).split("/"));
  const realRoot = fs.realpathSync(assetsRoot);
  if (!pathInside(assetsRoot, candidate) || !fs.existsSync(candidate)) throw new Error(`${context} references missing package asset '${value}'.`);
  if (!pathInside(realRoot, fs.realpathSync(candidate))) throw new Error(`${context} package asset '${value}' escapes the package assets directory.`);
  if (!fs.statSync(candidate).isFile()) throw new Error(`${context} package asset '${value}' must be a file.`);
}

function validatePageAndContentAssets(pages, content, assetsRoot) {
  validatePackageTree(assetsRoot);
  for (const [pageId, page] of Object.entries(pages)) for (const [sectionIndex, section] of page.sections.entries()) {
    if (section.component === "hero" && section.props?.image) {
      validateAssetReference(section.props.image, assetsRoot, `Page '${pageId}' hero image`);
    }
  }
  for (const item of content) if (item.fields.image) {
    validateAssetReference(item.fields.image, assetsRoot, `Content '${item.id}' image`);
  }
}

export function resolvePackagePaths(manifest, packageRoot) {
  validateManifestData(manifest);
  if (!path.isAbsolute(packageRoot) || !fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
    throw new Error("Package root must be an existing absolute directory.");
  }
  const root = path.resolve(packageRoot);
  const realRoot = fs.realpathSync(root);
  const paths = {};
  for (const key of ["site", "map", "navigation", "collections", "pages", "content", "places", "trails", "theme", "assets", ...(manifest.themeCss ? ["themeCss"] : [])]) {
    const candidate = path.resolve(root, ...manifest[key].split("/"));
    if (!pathInside(root, candidate)) throw new Error(`Package path '${key}' escapes the package root.`);
    if (!fs.existsSync(candidate)) throw new Error(`Missing package entry '${key}': ${manifest[key]}`);
    if (!pathInside(realRoot, fs.realpathSync(candidate))) throw new Error(`Resolved package path '${key}' escapes the package root.`);
    const stat = fs.statSync(candidate);
    if ((key === "content" || key === "assets") ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Package entry '${key}' has the wrong kind; expected ${(key === "content" || key === "assets") ? "a directory" : "a file"}.`);
    }
    paths[key] = candidate;
  }
  return { root, paths };
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""));
}

export function validateSitePackage(packageRoot) {
  const root = path.resolve(packageRoot);
  const manifest = validateManifestData(readJson(path.join(root, "manifest.json")));
  const { paths } = resolvePackagePaths(manifest, root);
  const site = validateSiteConfig(readJson(paths.site));
  validateSiteIdentity(site, manifest);
  validatePlaces(readJson(paths.places));
  const content = readContent(paths.content);
  const contentIds = new Set(content.map((item) => item.id));
  const collections = validateCollections(readJson(paths.collections), contentIds);
  const pages = validatePages(readJson(paths.pages), collections);
  validateGeneratedOutputPaths(pages, contentIds);
  validatePageAndContentAssets(pages, content, paths.assets);
  return { manifest, site };
}

function readContent(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink())) throw new Error("Site content cannot contain symbolic links.");
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort().map((name) => {
    const source = fs.readFileSync(path.join(directory, name), "utf8");
    const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
    const fields = {};
    if (match) for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([\w-]+):\s*(.*)$/);
      if (field) fields[field[1]] = field[2].replace(/^(?:"(.*)"|'(.*)')$/, (_, a, b) => a ?? b);
    }
    const id = path.basename(name, ".md");
    return { id, title: fields.title || id.replace(/-/g, " "), description: fields.description || fields.summary || "", body: match ? match[2].trim() : source.trim(), fields };
  });
}

function validatePackageTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Package assets cannot contain symbolic links: ${entry.name}`);
    if (entry.isDirectory()) validatePackageTree(fullPath);
    else if (!entry.isFile()) throw new Error(`Package assets contain an unsupported file: ${entry.name}`);
  }
}

function normalizePlaces(value) {
  if (!value || value.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("Site places must be a GeoJSON FeatureCollection.");
  const ids = new Set();
  return value.features.map((feature, index) => {
    const properties = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates;
    const id = String(feature?.id ?? properties.id ?? `place-${index + 1}`);
    const name = properties.name ?? properties.title ?? properties["Park Name"];
    const description = properties.description ?? properties.Description ?? "";
    const activityValue = properties.activities ?? properties.Activities ?? [];
    const activities = Array.isArray(activityValue) ? activityValue : String(activityValue).split(",").map((item) => item.trim()).filter(Boolean);
    if (!id || ids.has(id) || typeof name !== "string" || !name.trim() || !Array.isArray(coordinates) || coordinates.length < 2 ||
        !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) || coordinates[0] < -180 || coordinates[0] > 180 ||
        coordinates[1] < -90 || coordinates[1] > 90 || !Array.isArray(activities)) throw new Error(`Site place ${index + 1} is invalid.`);
    ids.add(id);
    return { id, name: name.trim(), description: String(description), activities: activities.map(String), coordinates: [coordinates[0], coordinates[1]] };
  });
}

/** Load, validate, and normalize every runtime input from a site package. */
export function loadSitePackage(packagePath) {
  const requested = path.resolve(packagePath);
  const { manifest, site } = validateSitePackage(requested);
  const { root, paths } = resolvePackagePaths(manifest, requested);
  const navigation = validateNavigation(readJson(paths.navigation));
  const collections = readJson(paths.collections);
  const pages = readJson(paths.pages);
  const map = readJson(paths.map);
  const theme = readJson(paths.theme);
  const places = normalizePlaces(readJson(paths.places));
  const trails = readJson(paths.trails);
  const content = readContent(paths.content);
  if (!trails || !Array.isArray(trails.hikes) || typeof trails.retrievedAt !== "string" || !Number.isFinite(Date.parse(trails.retrievedAt))) {
    throw new Error("Site trail snapshot is invalid.");
  }
  if (!map || typeof map.style !== "string" || !/^[a-z0-9-]+$/.test(map.style) || !Array.isArray(map.center) || map.center.length !== 2 ||
      !Number.isFinite(map.center[0]) || Math.abs(map.center[0]) > 180 || !Number.isFinite(map.center[1]) || Math.abs(map.center[1]) > 90 ||
      !Number.isFinite(map.zoom) || map.zoom < 0 || map.zoom > 24) throw new Error("Site map configuration is invalid.");
  if (!theme || theme.accent !== site.theme.accent || theme.background !== site.theme.background || theme.text !== site.theme.text ||
      (theme.fontFamily !== undefined && theme.fontFamily !== site.theme.fontFamily)) throw new Error("Site theme file must match the validated theme in site.json.");
  for (const [id, collection] of Object.entries(collections)) {
    if (!collection || !Array.isArray(collection.items)) throw new Error(`Collection '${id}' is invalid.`);
    collection.items = collection.items.map((item) => {
      if (!content.some((record) => record.id === item)) throw new Error(`Collection '${id}' refers to missing content '${item}'.`);
      return item;
    });
  }
  const themeCss = paths.themeCss ? fs.readFileSync(paths.themeCss, "utf8") : "";
  if (/@import\b|\burl\s*\(|\bexpression\s*\(/i.test(themeCss)) {
    throw new Error("Site theme CSS cannot import styles or reference external resources.");
  }
  return { manifest, config: site, navigation, pages, collections, places, trails, content, map, theme, themeCss, paths: { root, ...paths } };
}
