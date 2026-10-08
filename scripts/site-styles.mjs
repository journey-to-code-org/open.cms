import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sass = require("sass");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function buildSiteThemeCss(site) {
  const { accent, background, text, fontFamily } = site.theme;
  return `:root{--cms-accent:${accent};--page:${background};--ink:${text};--leaf:${accent};--gold:${accent};${fontFamily ? `font-family:${fontFamily};` : ""}}\n${site.themeCss || ""}`;
}

/** Same static foundation and package theme are used by Vite dev and production. */
export function buildSiteStylesheet(site) {
  const engineCss = sass.compile(path.join(root, "src", "static-site.scss"), { style: "compressed" }).css;
  return `${engineCss}\n${buildSiteThemeCss(site)}`;
}
