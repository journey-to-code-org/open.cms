import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAGE_COMPONENTS = new Set(["hero", "guide-collection", "feature-gallery", "install-prompt"]);
const MANIFEST_PATHS = ["site", "map", "navigation", "collections", "pages", "content", "places", "trails", "theme", "assets"];
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const pathInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
};

export function validateManifest(manifest, root) {
  if (!isRecord(manifest)) throw new Error("Manifest must be an object.");
  if (manifest.format !== 1) throw new Error("Unsupported manifest format; expected format 1.");
  if (typeof manifest.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) throw new Error("Manifest id must be a kebab-case package id.");
  if (!nonEmpty(manifest.name)) throw new Error("Manifest name must not be empty.");
  if (typeof manifest.version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error("Manifest version must be a semantic version (for example, 1.0.0).");
  }
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error("Package root must be an absolute path.");
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) throw new Error("Package root must be an existing directory.");
  const realRoot = fs.realpathSync(resolvedRoot);
  const resolvedPaths = {};
  for (const key of MANIFEST_PATHS) {
    const value = manifest[key];
    if (typeof value !== "string" || value.trim() === "" || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
      throw new Error(`Package path '${key}' must be a non-empty relative path using forward slashes.`);
    }
    if (value.split("/").includes("..")) throw new Error(`Package path '${key}' cannot contain parent-directory segments.`);
    const candidate = path.resolve(resolvedRoot, ...value.split("/"));
    if (!pathInside(resolvedRoot, candidate)) throw new Error(`Package path '${key}' escapes the package root.`);
    if (!fs.existsSync(candidate)) throw new Error(`Missing package entry '${key}': ${value}`);
    if (!pathInside(realRoot, fs.realpathSync(candidate))) throw new Error(`Resolved package path '${key}' escapes the package root.`);
    const stat = fs.statSync(candidate);
    if ((key === "content" || key === "assets") ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Package entry '${key}' has the wrong kind; expected ${(key === "content" || key === "assets") ? "a directory" : "a file"}.`);
    }
    resolvedPaths[key] = candidate;
  }
  return { manifest, root: resolvedRoot, paths: resolvedPaths };
}

export function validateSiteConfig(site, manifest) {
  if (!isRecord(site)) throw new Error("Site configuration must be an object.");
  if (!nonEmpty(site.id)) throw new Error("Site id must not be empty.");
  if (site.id !== manifest.id) throw new Error("Site id must match the manifest id.");
  if (!nonEmpty(site.name)) throw new Error("Site name must not be empty.");
  if (!nonEmpty(site.description)) throw new Error("Site description must not be empty.");
  if (!nonEmpty(site.locale)) throw new Error("Site locale must not be empty.");
  if (!isRecord(site.region) || !nonEmpty(site.region.name)) throw new Error("Region name must not be empty.");
  const bounds = site.region.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 2 || !bounds.every((pair) =>
    Array.isArray(pair) && pair.length === 2 && pair.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)))) {
    throw new Error("Region bounds must contain exactly two finite [longitude, latitude] coordinate pairs.");
  }
  const [[west, south], [east, north]] = bounds;
  if (west < -180 || west > 180 || east < -180 || east > 180 || south < -90 || south > 90 || north < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("Region bounds must use valid longitude/latitude ranges with west < east and south < north.");
  }
  if (!isRecord(site.seo) || !nonEmpty(site.seo.title) || !nonEmpty(site.seo.description)) throw new Error("SEO title and description must not be empty.");
  if (!isRecord(site.pwa) || !nonEmpty(site.pwa.name) || !nonEmpty(site.pwa.shortName) || !nonEmpty(site.pwa.description) ||
      !nonEmpty(site.pwa.themeColor) || !nonEmpty(site.pwa.backgroundColor) || !Array.isArray(site.pwa.icons) ||
      !site.pwa.icons.every(nonEmpty)) throw new Error("PWA configuration requires identity, colors, and a string icon list.");
  if (!isRecord(site.theme) || !nonEmpty(site.theme.accent) || !nonEmpty(site.theme.background) || !nonEmpty(site.theme.text)) {
    throw new Error("Theme configuration requires accent, background, and text values.");
  }
  return site;
}

export function validatePlaces(places) {
  if (!isRecord(places) || places.type !== "FeatureCollection" || !Array.isArray(places.features)) {
    throw new Error("Places data must be a GeoJSON FeatureCollection with a features array.");
  }
  const ids = new Set();
  for (let index = 0; index < places.features.length; index++) {
    const feature = places.features[index];
    if (!isRecord(feature)) throw new Error(`Place feature ${index} must be an object.`);
    if (feature.type !== "Feature") throw new Error(`Place feature ${index} must use GeoJSON type Feature.`);
    const id = feature.id;
    if (!(nonEmpty(id) || (typeof id === "number" && Number.isFinite(id)))) throw new Error(`Place feature ${index} requires a string or finite numeric id.`);
    if (ids.has(String(id))) throw new Error(`Duplicate place id '${id}'.`);
    ids.add(String(id));
    if (!isRecord(feature.properties)) throw new Error(`Place '${id}' requires a properties object.`);
    if (!isRecord(feature.geometry) || feature.geometry.type !== "Point" || !Array.isArray(feature.geometry.coordinates) ||
        (feature.geometry.coordinates.length !== 2 && feature.geometry.coordinates.length !== 3)) {
      throw new Error(`Place '${id}' must have Point geometry with longitude/latitude coordinates.`);
    }
    const [longitude, latitude, altitude] = feature.geometry.coordinates;
    if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        (altitude !== undefined && (typeof altitude !== "number" || !Number.isFinite(altitude)))) {
      throw new Error(`Place '${id}' has invalid longitude/latitude coordinates.`);
    }
  }
  return places;
}

export function validateCollections(collections, contentDirectory) {
  if (!isRecord(collections)) throw new Error("Collections must be an object keyed by collection id.");
  const articles = new Set(fs.readdirSync(contentDirectory).filter((name) => name.endsWith(".md")).map((name) => path.basename(name, ".md")));
  for (const [id, collection] of Object.entries(collections)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !isRecord(collection)) throw new Error(`Collection '${id}' must be an object with a valid kebab-case id.`);
    if (!nonEmpty(collection.title)) throw new Error(`Collection '${id}' requires a non-empty title.`);
    if (collection.label !== undefined && !nonEmpty(collection.label)) throw new Error(`Collection '${id}' label must be a non-empty string when provided.`);
    if (!Array.isArray(collection.items)) throw new Error(`Collection '${id}' items must be an array.`);
    const seen = new Set();
    for (const item of collection.items) {
      if (!nonEmpty(item)) throw new Error(`Collection '${id}' item ids must be non-empty strings.`);
      if (seen.has(item)) throw new Error(`Collection '${id}' contains duplicate item '${item}'.`);
      seen.add(item);
      if (!articles.has(item)) throw new Error(`Collection '${id}' references missing Markdown content '${item}'.`);
    }
  }
  return collections;
}

export function validatePages(pages, collections) {
  if (!isRecord(pages) || Object.keys(pages).length === 0) throw new Error("Pages must be a non-empty object keyed by page id.");
  for (const [id, page] of Object.entries(pages)) {
    if (!isRecord(page) || !nonEmpty(page.route) || !page.route.startsWith("/")) throw new Error(`Page '${id}' must have an absolute route.`);
    if (!Array.isArray(page.sections)) throw new Error(`Page '${id}' sections must be an array.`);
    for (const [index, section] of page.sections.entries()) {
      if (!isRecord(section) || typeof section.component !== "string" || !PAGE_COMPONENTS.has(section.component)) {
        throw new Error(`Page '${id}' section ${index} uses an unknown component.`);
      }
      if (section.props !== undefined && !isRecord(section.props)) throw new Error(`Page '${id}' section ${index} props must be an object when provided.`);
      if (section.component === "guide-collection") {
        const collectionId = section.props?.collection;
        if (!nonEmpty(collectionId) || !Object.hasOwn(collections, collectionId)) throw new Error(`Page '${id}' references an unknown guide collection.`);
      }
    }
  }
  return pages;
}

export function validateSitePackage(packageRoot) {
  const root = path.resolve(packageRoot);
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
  const resolved = validateManifest(manifest, root);
  const read = (key) => JSON.parse(fs.readFileSync(resolved.paths[key], "utf8").replace(/^\uFEFF/, ""));
  const site = validateSiteConfig(read("site"), manifest);
  validatePlaces(read("places"));
  const collections = validateCollections(read("collections"), resolved.paths.content);
  validatePages(read("pages"), collections);
  return { manifest, site };
}

export function packageRootFromModule(moduleUrl) {
  return path.dirname(fileURLToPath(moduleUrl));
}
