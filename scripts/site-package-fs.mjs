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

function validateAssetReference(value, assetsRoot, context, assetFiles) {
  if (!validatePublicAssetPath(value)) throw new Error(`${context} must be a safe package asset path beginning with '/'.`);
  const relative = value.slice(1);
  if (!assetFiles.has(relative)) throw new Error(`${context} references missing package asset '${value}'.`);
  const candidate = path.resolve(assetsRoot, ...relative.split("/"));
  const realRoot = fs.realpathSync(assetsRoot);
  if (!pathInside(assetsRoot, candidate) || !fs.existsSync(candidate)) throw new Error(`${context} references missing package asset '${value}'.`);
  if (!pathInside(realRoot, fs.realpathSync(candidate))) throw new Error(`${context} package asset '${value}' escapes the package assets directory.`);
  if (!fs.statSync(candidate).isFile()) throw new Error(`${context} package asset '${value}' must be a file.`);
}

function validateContentMetadata(content) {
  for (const item of content) {
    for (const field of ["title", "description", "summary", "image", "imageAlt"]) {
      if (item.fields[field] !== undefined && (typeof item.fields[field] !== "string" || !item.fields[field].trim())) {
        throw new Error(`Content '${item.id}' metadata '${field}' must be a non-empty string.`);
      }
    }
    if (item.fields.imageAlt && !item.fields.image) {
      throw new Error(`Content '${item.id}' metadata 'imageAlt' requires an 'image'.`);
    }
  }
}

function validatePageAndContentAssets(pages, content, assetsRoot, assetFiles, site) {
  validateContentMetadata(content);
  for (const [pageId, page] of Object.entries(pages)) for (const [sectionIndex, section] of page.sections.entries()) {
    if (section.component === "hero" && section.props?.image) {
      validateAssetReference(section.props.image, assetsRoot, `Page '${pageId}' hero image`, assetFiles);
    }
  }
  for (const item of content) if (item.fields.image) {
    validateAssetReference(item.fields.image, assetsRoot, `Content '${item.id}' image`, assetFiles);
  }
  for (const icon of site.pwa.icons) validateAssetReference(icon, assetsRoot, `PWA icon`, assetFiles);
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
  let packageId = path.basename(root);
  try {
    const manifest = validateManifestData(readJson(path.join(root, "manifest.json")));
    packageId = manifest.id;
    const { paths } = resolvePackagePaths(manifest, root);
    const site = validateSiteConfig(readJson(paths.site));
    validateSiteIdentity(site, manifest);
    validatePlaces(readJson(paths.places));
    const content = readContent(paths.content);
    const contentIds = new Set(content.map((item) => item.id));
    const collections = validateCollections(readJson(paths.collections), contentIds);
    const pages = validatePages(readJson(paths.pages), collections);
    const assetPaths = validatePackageTree(paths.assets);
    validateGeneratedOutputPaths(pages, contentIds, assetPaths);
    validatePageAndContentAssets(pages, content, paths.assets, new Set(assetPaths), site);
    return { manifest, site };
  } catch (error) {
    throw packageValidationError(packageId, error);
  }
}

function packageValidationError(packageId, error) {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = `Site package '${packageId}' is invalid:`;
  if (message.startsWith(prefix)) return error;
  return new Error(`${prefix} ${message}`, { cause: error });
}

function readContent(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink())) throw new Error("Site content cannot contain symbolic links.");
  const nested = entries.find((entry) => entry.isDirectory());
  if (nested) throw new Error(`Content directories must be flat; found nested directory '${nested.name}'.`);
  const content = entries.filter((entry) => entry.isFile() && /\.md$/i.test(entry.name)).map((entry) => entry.name).sort().map((name) => {
    const id = name.slice(0, -3);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`Content filename '${name}' must use a lowercase kebab-case ID (for example, 'fern-creek.md').`);
    }
    const source = fs.readFileSync(path.join(directory, name), "utf8");
    const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
    const fields = {};
    if (match) for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([\w-]+):\s*(.*)$/);
      if (field) fields[field[1]] = field[2].replace(/^(?:"(.*)"|'(.*)')$/, (_, a, b) => a ?? b);
    }
    return { id, title: fields.title || id.replace(/-/g, " "), description: fields.description || fields.summary || "", body: match ? match[2].trim() : source.trim(), fields };
  });
  const ids = new Map();
  for (const item of content) {
    const key = item.id.toLocaleLowerCase("en-US");
    const previous = ids.get(key);
    if (previous) throw new Error(`Content filenames '${previous}.md' and '${item.id}.md' generate the same case-insensitive article ID.`);
    ids.set(key, item.id);
  }
  return content;
}

function validatePackageTree(directory) {
  const seen = new Map();
  const files = [];
  function walk(current, relative = "") {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Package assets cannot contain symbolic links: ${relative ? `${relative}/` : ""}${entry.name}`);
      const outputPath = relative ? `${relative}/${entry.name}` : entry.name;
      const key = outputPath.toLocaleLowerCase("en-US");
      const previous = seen.get(key);
      if (previous) throw new Error(`Package asset paths '${previous}' and '${outputPath}' differ only by case.`);
      seen.set(key, outputPath);
      if (entry.isDirectory()) walk(fullPath, outputPath);
      else if (entry.isFile()) files.push(outputPath);
      else throw new Error(`Package assets contain an unsupported file: ${outputPath}`);
    }
  }
  walk(directory);
  return files;
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
  try {
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
  } catch (error) {
    throw packageValidationError(manifest.id, error);
  }
}
