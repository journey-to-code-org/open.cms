import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { discoverHikes, parseDiscovery, OVERPASS_URL } from "../src/hikes";
import { loadSitePackage } from "./site-package-fs.mjs";
import { activeSiteFromArgs } from "./active-site.mjs";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const endpointIndex = args.findIndex((arg) => arg === "--endpoint");
  const inputIndex = args.findIndex((arg) => arg === "--input");
  const endpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : OVERPASS_URL;
  const site = loadSitePackage(activeSiteFromArgs(args));
  const snapshot = inputIndex >= 0
    ? parseDiscovery(JSON.parse(await readFile(resolve(args[inputIndex + 1]), "utf8")), site.config.region.bounds)
    : await discoverHikes(AbortSignal.timeout(35_000), site.config.region.bounds, endpoint);
  if (!snapshot.hikes.length) throw new Error("No regional trails returned; refusing to overwrite the package snapshot.");
  await writeFile(site.paths.trails, `${JSON.stringify(snapshot)}\n`);
  console.log(`Saved ${snapshot.hikes.length} regional mapped features to ${site.manifest.id}, retrieved ${snapshot.retrievedAt}.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
