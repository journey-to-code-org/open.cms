import path from "node:path";
import { validateSitePackage } from "./site-package-fs.mjs";

const siteDirectory = path.resolve(process.argv[2] || "sites/garrett-county");
try {
  const { manifest } = validateSitePackage(siteDirectory);
  console.log(`Valid site package: ${manifest.name} (${manifest.id}), format ${manifest.format}`);
} catch (error) {
  console.error(`Site validation failed: ${error.message}`);
  process.exitCode = 1;
}
