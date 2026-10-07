import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "sites/garrett-county");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8").replace(/^\uFEFF/, ""));
try {
  const manifest = read("manifest.json");
  const required = ["site", "map", "navigation", "collections", "pages", "content", "places", "trails", "theme", "assets"];
  if (manifest.format !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id || "")) throw new Error("Unsupported manifest format or invalid package id.");
  for (const key of required) {
    const value = manifest[key];
    if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) throw new Error(`Invalid package path: ${key}`);
    if (!fs.existsSync(path.join(root, value))) throw new Error(`Missing package entry: ${key} (${value})`);
  }
  const site = read(manifest.site);
  if (site.id !== manifest.id) throw new Error("Manifest and site ids must match.");
  const [[west, south], [east, north]] = site.region?.bounds || [];
  if (![west, south, east, north].every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) throw new Error("Invalid region bounds.");
  const collectionIds = new Set(Object.keys(read(manifest.collections)));
  const pages = read(manifest.pages);
  for (const page of Object.values(pages)) for (const section of page.sections || []) {
    if (section.component === "guide-collection" && !collectionIds.has(section.props?.collection)) throw new Error(`Page references missing collection: ${section.props?.collection}`);
  }
  const places = read(manifest.places);
  if (places.type !== "FeatureCollection" || !Array.isArray(places.features)) throw new Error("Places data must be a GeoJSON FeatureCollection.");
  const ids = new Set(fs.readdirSync(path.join(root, manifest.content)).filter((name) => name.endsWith(".md")).map((name) => path.basename(name, ".md")));
  for (const collection of Object.values(read(manifest.collections))) for (const id of collection.items || []) if (!ids.has(id)) throw new Error(`Collection references missing article: ${id}`);
  console.log(`Valid site package: ${manifest.name} (${manifest.id}), format ${manifest.format}`);
} catch (error) {
  console.error(`Site validation failed: ${error.message}`);
  process.exitCode = 1;
}
