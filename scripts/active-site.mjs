import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function activeSiteFromArgs(args = process.argv.slice(2)) {
  let requested = process.env.OPEN_CMS_SITE;
  const positional = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--site") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--site requires a package directory path.");
      requested = value;
    } else if (args[index].startsWith("--site=")) {
      requested = args[index].slice("--site=".length);
      if (!requested) throw new Error("--site requires a package directory path.");
    } else if (!args[index].startsWith("-")) positional.push(args[index]);
  }
  if (!requested && positional.length === 1) requested = positional[0];
  if (!requested && positional.length > 1) throw new Error("Choose one site package directory path.");
  if (!requested) requested = path.join(root, "sites", "demo-region");
  const resolved = path.resolve(root, requested);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("The site path must stay inside this repository.");
  }
  return resolved;
}
