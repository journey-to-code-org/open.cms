import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parseSiteConfig, parseSiteManifest } from "../src/site-package";

const packageData = (site: string, file: string) => JSON.parse(
  readFileSync(resolve("sites", site, file), "utf8"),
);

test("both site fixtures use the version 1 manifest and valid typed configuration", () => {
  for (const id of ["garrett-county", "demo-region"]) {
    const manifest = parseSiteManifest(packageData(id, "manifest.json"));
    const site = parseSiteConfig(packageData(id, "site.json"));
    assert.equal(manifest.format, 1);
    assert.equal(site.id, manifest.id);
    assert.ok(site.region.bounds[0][0] < site.region.bounds[1][0]);
  }
});

test("manifest paths cannot escape the package directory", () => {
  const manifest = packageData("demo-region", "manifest.json");
  assert.throws(() => parseSiteManifest({ ...manifest, places: "../outside.geojson" }), /package-relative/);
  assert.throws(() => parseSiteManifest({ ...manifest, format: 2 }), /unsupported format/);
});

test("site bounds reject reversed, out-of-range, and non-finite coordinates", () => {
  const site = packageData("demo-region", "site.json");
  for (const bounds of [
    [[1, 0], [0, 1]], [[-181, 0], [0, 1]], [[0, 0], [1, Number.POSITIVE_INFINITY]],
  ]) assert.throws(() => parseSiteConfig({ ...site, region: { ...site.region, bounds } }), /site configuration|bounds/);
});
