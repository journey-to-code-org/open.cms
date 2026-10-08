const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");

async function main() {
  const { activeSiteFromArgs } = await import(pathToFileURL(path.join(root, "scripts", "active-site.mjs")));
  const site = activeSiteFromArgs(process.argv.slice(2));
  for (const [command, args] of [
    ["wasm-pack", ["build", "rust", "--target", "web", "--out-dir", "pkg"]],
    [process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit"]],
    [process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build"]],
  ]) {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, OPEN_CMS_SITE: site } });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
