import fs from "node:fs";
import path from "node:path";
import {
  validateCollections,
  validateManifestData,
  validatePages,
  validatePlaces,
  validateSiteConfig,
  validateSiteIdentity,
} from "../shared/site-validation.mjs";

const pathInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
};

export function resolvePackagePaths(manifest, packageRoot) {
  validateManifestData(manifest);
  if (!path.isAbsolute(packageRoot) || !fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
    throw new Error("Package root must be an existing absolute directory.");
  }
  const root = path.resolve(packageRoot);
  const realRoot = fs.realpathSync(root);
  const paths = {};
  for (const key of ["site", "map", "navigation", "collections", "pages", "content", "places", "trails", "theme", "assets"]) {
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
  const contentIds = new Set(fs.readdirSync(paths.content)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.basename(name, ".md")));
  const collections = validateCollections(readJson(paths.collections), contentIds);
  validatePages(readJson(paths.pages), collections);
  return { manifest, site };
}
